do $$
declare a jsonb; b jsonb; n jsonb; c jsonb; w uuid; old_id uuid := gen_random_uuid(); token_id uuid := gen_random_uuid();
  owner text := '0x1111111111111111111111111111111111111111';
  receiver text := '0x2222222222222222222222222222222222222222';
begin
  a := public.payr_privy_wallet_v1('did:privy:new', 'wallet-new', receiver);
  if a -> 'session' <> 'null'::jsonb then raise exception 'wallet must not create workspace'; end if;
  a := public.payr_privy_create_workspace_v1('did:privy:new');
  w := (a #>> '{session,workspaceId}')::uuid;
  if (select payout_wallet from public.sender_profiles where workspace_id = w) <> receiver then raise exception 'wrong new default'; end if;
  if public.payr_privy_create_workspace_v1('did:privy:new') <> a then raise exception 'duplicate workspace'; end if;
  if public.payr_privy_wallet_v1('did:privy:new', 'wallet-new', receiver) <> a then raise exception 'duplicate wallet mapping'; end if;
  begin
    perform public.payr_privy_wallet_v1('did:privy:new', 'other-wallet', owner);
    raise exception 'wallet takeover allowed';
  exception when raise_exception then if sqlerrm <> 'IDENTITY_CONFLICT' then raise; end if; end;

  insert into public.workspaces(id, owner_wallet) values(old_id, owner);
  insert into public.sender_profiles(id, workspace_id, payout_wallet) values(gen_random_uuid(), old_id, owner);
  c := public.payr_create_connector_v1(old_id, owner, token_id, repeat('a',64), clock_timestamp() + interval '1 day');
  perform public.payr_privy_wallet_v1('did:privy:legacy', 'wallet-legacy', '0x3333333333333333333333333333333333333333');
  n := public.payr_privy_issue_link_v1('did:privy:legacy', owner, 'https://payr.test', 5042002);
  if position('did:privy:legacy' in (n ->> 'message')) = 0 or position(old_id::text in (n ->> 'message')) = 0 then raise exception 'unbound proof'; end if;
  if public.payr_privy_find_link_v1('did:privy:new', (n->>'id')::uuid) is not null then raise exception 'cross-user challenge exposed'; end if;
  b := public.payr_privy_complete_link_v1('did:privy:legacy', (n->>'id')::uuid);
  if (b #>> '{session,workspaceId}')::uuid <> old_id or b #>> '{session,ownerWallet}' <> owner then raise exception 'legacy identity changed'; end if;
  if (select payout_wallet from public.sender_profiles where workspace_id = old_id) <> owner then raise exception 'legacy payout changed'; end if;
  if not exists(select 1 from public.connector_tokens where id = token_id and token_hash = repeat('a',64)) then raise exception 'legacy credential changed'; end if;
  begin
    perform public.payr_privy_complete_link_v1('did:privy:legacy', (n->>'id')::uuid);
    raise exception 'replay allowed';
  exception when raise_exception then if sqlerrm <> 'NONCE_INVALID_OR_USED' then raise; end if; end;
  begin
    perform public.payr_wallet_context_v1(old_id, null, token_id);
    raise exception 'invoice-only discovery allowed';
  exception when raise_exception then if sqlerrm <> 'NOT_FOUND' then raise; end if; end;
  token_id := gen_random_uuid();
  perform public.payr_create_connector_v2(old_id, owner, token_id, repeat('b',64), clock_timestamp() + interval '1 day', array['invoice:status','wallet:read']);
  a := public.payr_wallet_context_v1(old_id, null, token_id);
  if a #>> '{businessWallet,address}' <> '0x3333333333333333333333333333333333333333'
    or a ->> 'invoicePayoutAddress' <> owner then raise exception 'wallet/payout conflated'; end if;
  begin
    perform public.payr_wallet_context_v1(w, null, token_id);
    raise exception 'cross-workspace discovery allowed';
  exception when raise_exception then if sqlerrm <> 'NOT_FOUND' then raise; end if; end;
  perform public.payr_admin_provision_gateway_key_v1(gen_random_uuid(), 'demo', repeat('c',64), array['get_account_context']);
  c := public.payr_privy_gateway_credential_v1('did:privy:legacy', old_id, 'demo', gen_random_uuid(), repeat('d',64),
    clock_timestamp() + interval '1 day', array['invoice:status','wallet:read']);
  if not exists(select 1 from public.agent_account_credentials where connector_token_id = (c->>'id')::uuid and service_id='demo') then raise exception 'missing gateway binding'; end if;
  update public.privy_accounts set revoked_at = clock_timestamp() where user_id = 'did:privy:legacy';
  if public.payr_privy_account_v1('did:privy:legacy') is not null then raise exception 'revoked identity accepted'; end if;
  if has_function_privilege('anon','public.payr_privy_complete_link_v1(text,uuid)','execute')
    or has_function_privilege('authenticated','public.payr_privy_wallet_v1(text,text,text)','execute')
    or has_table_privilege('service_role','public.privy_accounts','update') then raise exception 'unsafe grants'; end if;
end;
$$;
