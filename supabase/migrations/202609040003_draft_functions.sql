begin;

alter table public.invoice_versions add column draft_snapshot jsonb;

create function public.payr_draft_scope_v1(p_workspace_id uuid, p_owner_wallet text, p_connector_id uuid, p_scope text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_token public.connector_tokens;
begin
  if (p_owner_wallet is null) = (p_connector_id is null) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if p_owner_wallet is not null then
    perform 1 from public.workspaces as w where w.id = p_workspace_id and w.owner_wallet = p_owner_wallet for share;
    if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  else
    -- Use the same token-first order as F2 admission/revocation, holding the lock through the write.
    select t.* into v_token from public.connector_tokens as t
      where t.workspace_id = p_workspace_id and t.id = p_connector_id for update;
    if not found or v_token.revoked_at is not null or v_token.expires_at <= pg_catalog.clock_timestamp()
      or (p_scope = any(v_token.scopes)) is not true then
      raise exception using errcode = 'P0001', message = 'NOT_FOUND';
    end if;
  end if;
end;
$$;

create function public.payr_draft_text_v1(p_value jsonb, p_max integer, p_min integer default 1)
returns boolean language sql immutable security definer set search_path = '' as $$
  select (pg_catalog.jsonb_typeof(p_value) = 'string'
    and pg_catalog.length(pg_catalog.regexp_replace(p_value #>> '{}', U&'[\+010000-\+10FFFF]', 'xx', 'g')) between p_min and p_max
    and p_value #>> '{}' = pg_catalog.btrim(p_value #>> '{}',
      U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) is true;
$$;

create function public.payr_draft_billing_v1(p_value jsonb)
returns boolean language plpgsql immutable security definer set search_path = '' as $$
declare v_normalized jsonb;
begin
  if not public.payr_identity_object_v1(p_value, array['businessName','billingAddress','contactName','contactEmail']) then return false; end if;
  v_normalized := public.payr_identity_save_input_v1(p_value ||
    '{"id":null,"expectedRevision":null,"alias":"validation"}'::jsonb, true) - array['id','expectedRevision','alias'];
  return v_normalized = p_value and p_value #>> '{billingAddress,countryCode}' = any(pg_catalog.string_to_array(
    'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW', ' '));
exception when sqlstate '22023' then return false;
end;
$$;

create function public.payr_draft_provenance_v1(p_value jsonb)
returns boolean language plpgsql immutable security definer set search_path = '' as $$
declare v_url text; v_authority text; v_parts text[]; v_host text; v_port text;
begin
  if p_value = '{"kind":"user_provided"}'::jsonb then return true; end if;
  if not public.payr_identity_object_v1(p_value, array['kind','url']) or p_value ->> 'kind' <> 'web_source'
    or not public.payr_draft_text_v1(p_value -> 'url', 65536) then return false; end if;
  v_url := p_value ->> 'url';
  if v_url !~* '^https?://' or v_url ~ '[[:space:][:cntrl:]\\]' then return false; end if;
  v_authority := pg_catalog.substring(v_url, '(?i)^https?://([^/?#]+)');
  if v_authority is null or pg_catalog.strpos(v_authority,'@') > 0 then return false; end if;
  if pg_catalog.left(v_authority,1) = '[' then
    v_parts := pg_catalog.regexp_match(v_authority,'(?i)^\[([0-9a-f:.]+)\](:([0-9]{0,5}))?$');
    if v_parts is null or pg_catalog.family(v_parts[1]::inet) <> 6 then return false; end if;
  else
    v_parts := pg_catalog.regexp_match(v_authority,'^([[:alnum:]]([[:alnum:].-]*[[:alnum:].])?)(:([0-9]{0,5}))?$');
    if v_parts is null then return false; end if;
    v_host := v_parts[1];
    if v_host ~ '^[0-9.]+$' and pg_catalog.family(v_host::inet) <> 4 then return false; end if;
    v_parts[3] := v_parts[4];
  end if;
  v_port := nullif(v_parts[3],'');
  return v_port is null or v_port::integer <= 65535;
exception when invalid_text_representation then return false;
end;
$$;

create function public.payr_draft_money_v1(p_value jsonb)
returns boolean language plpgsql immutable security definer set search_path = '' as $$
begin
  if (pg_catalog.jsonb_typeof(p_value -> 'amountDecimal') = 'string'
    and pg_catalog.jsonb_typeof(p_value -> 'amountAtomic') = 'string'
    and pg_catalog.length(p_value ->> 'amountDecimal') <= 79
    and p_value ->> 'amountDecimal' ~ '^(0|[1-9][0-9]*)(\.[0-9]{0,17}[1-9])?$'
    and p_value ->> 'amountAtomic' ~ '^[1-9][0-9]{0,77}$') is not true then return false; end if;
  return (p_value ->> 'amountAtomic')::numeric <= 115792089237316195423570985008687907853269984665640564039457584007913129639935
    and (p_value ->> 'amountDecimal')::numeric * 1000000000000000000 = (p_value ->> 'amountAtomic')::numeric;
end;
$$;

create function public.payr_draft_snapshot_valid_v1(p_value jsonb)
returns boolean language plpgsql immutable security definer set search_path = '' as $$
declare
  v_sender jsonb; v_ref jsonb; v_changes jsonb; v_fields jsonb; v_item jsonb; v_key text;
  v_sum numeric := 0; v_issue date; v_due date; v_deadline text; v_seen text[] := '{}'::text[];
begin
  if not public.payr_identity_object_v1(p_value, array['schemaVersion','sender','client','clientReference','clientProvenance',
    'proposedClientChanges','items','issueDate','dueDate','payableUntil','amountDecimal','amountAtomic','memo','appliedDefaults'])
    or p_value ->> 'schemaVersion' <> 'payr.draft.v1' then return false; end if;
  v_sender := p_value -> 'sender'; v_ref := p_value -> 'clientReference';
  v_changes := p_value -> 'proposedClientChanges'; v_fields := v_changes -> 'fields';
  if not public.payr_identity_object_v1(v_sender, array['id','revision','businessName','billingAddress','contactName',
    'contactEmail','payoutWallet','invoicePrefix','defaultPaymentTermsDays'])
    or not public.payr_draft_billing_v1(v_sender - array['id','revision','payoutWallet','invoicePrefix','defaultPaymentTermsDays'])
    or not public.payr_draft_billing_v1(p_value -> 'client') then return false; end if;
  if (pg_catalog.jsonb_typeof(v_sender -> 'id') = 'string' and v_sender ->> 'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and pg_catalog.jsonb_typeof(v_sender -> 'revision') = 'number' and v_sender ->> 'revision' ~ '^[1-9][0-9]{0,9}$'
    and (v_sender ->> 'revision')::numeric <= 2147483647
    and pg_catalog.jsonb_typeof(v_sender -> 'payoutWallet') = 'string' and v_sender ->> 'payoutWallet' ~ '^0x[0-9a-f]{40}$'
    and pg_catalog.jsonb_typeof(v_sender -> 'invoicePrefix') = 'string' and v_sender ->> 'invoicePrefix' ~ '^[A-Z0-9][A-Z0-9-]{0,31}$'
    and (v_sender -> 'defaultPaymentTermsDays' = 'null'::jsonb or (pg_catalog.jsonb_typeof(v_sender -> 'defaultPaymentTermsDays') = 'number'
      and v_sender ->> 'defaultPaymentTermsDays' ~ '^(0|[1-9][0-9]{0,2})$' and (v_sender ->> 'defaultPaymentTermsDays')::numeric <= 365))) is not true then return false; end if;
  if not public.payr_identity_object_v1(v_ref, array['id','alias','revision'])
    or not public.payr_identity_object_v1(p_value -> 'clientProvenance', array['businessName','billingAddress','contactName','contactEmail'])
    or not public.payr_identity_object_v1(v_changes, array['kind','fields'])
    or not public.payr_identity_object_v1(v_fields, '{}'::text[], array['businessName','billingAddress','contactName','contactEmail']) then return false; end if;
  if (v_ref -> 'alias' <> 'null'::jsonb and not public.payr_draft_text_v1(v_ref -> 'alias', 100)) then return false; end if;
  if v_ref -> 'id' = 'null'::jsonb then
    if v_ref -> 'revision' <> 'null'::jsonb or v_changes ->> 'kind' <> 'create'
      or not (v_fields ?& array['businessName','billingAddress','contactName','contactEmail']) then return false; end if;
  else
    if (pg_catalog.jsonb_typeof(v_ref -> 'id') = 'string' and v_ref ->> 'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and public.payr_draft_text_v1(v_ref -> 'alias', 100) and pg_catalog.jsonb_typeof(v_ref -> 'revision') = 'number'
      and v_ref ->> 'revision' ~ '^[1-9][0-9]{0,9}$' and (v_ref ->> 'revision')::numeric <= 2147483647
      and v_changes ->> 'kind' = case when v_fields = '{}'::jsonb then 'none' else 'update' end) is not true then return false; end if;
  end if;
  foreach v_key in array array['businessName','billingAddress','contactName','contactEmail'] loop
    if v_fields ? v_key then
      v_item := v_fields -> v_key;
      if not public.payr_identity_object_v1(v_item, array['value','provenance','confirmed'])
        or v_item -> 'confirmed' <> 'true'::jsonb or v_item -> 'value' is distinct from p_value -> 'client' -> v_key
        or not public.payr_draft_provenance_v1(v_item -> 'provenance')
        or v_item -> 'provenance' is distinct from p_value -> 'clientProvenance' -> v_key then return false; end if;
    elsif p_value -> 'clientProvenance' -> v_key is distinct from '{"kind":"saved_profile"}'::jsonb then return false;
    end if;
  end loop;
  if not public.payr_draft_money_v1(p_value) or not public.payr_draft_text_v1(p_value -> 'memo', 2000, 0)
    or pg_catalog.jsonb_typeof(p_value -> 'items') is distinct from 'array' then return false; end if;
  if pg_catalog.jsonb_array_length(p_value -> 'items') not between 1 and 100 then return false; end if;
  for v_item in select a.value from pg_catalog.jsonb_array_elements(p_value -> 'items') as a(value) loop
    if not public.payr_identity_object_v1(v_item, array['description','amountDecimal','amountAtomic'])
      or not public.payr_draft_text_v1(v_item -> 'description', 500) or not public.payr_draft_money_v1(v_item) then return false; end if;
    v_sum := v_sum + (v_item ->> 'amountAtomic')::numeric;
  end loop;
  if v_sum <> (p_value ->> 'amountAtomic')::numeric then return false; end if;
  foreach v_key in array array['issueDate','dueDate'] loop
    if pg_catalog.jsonb_typeof(p_value -> v_key) <> 'string' or p_value ->> v_key !~ '^[2-9][0-9]{3}-[0-9]{2}-[0-9]{2}$'
      or pg_catalog.to_char((p_value ->> v_key)::date, 'YYYY-MM-DD') <> p_value ->> v_key then return false; end if;
  end loop;
  v_issue := (p_value ->> 'issueDate')::date; v_due := (p_value ->> 'dueDate')::date;
  if v_due < v_issue or v_due + 30 > date '9999-12-31' then return false; end if;
  v_deadline := pg_catalog.to_char(v_due + 30, 'YYYY-MM-DD') || 'T00:00:00.000Z';
  if p_value -> 'payableUntil' is distinct from pg_catalog.to_jsonb(v_deadline)
    or pg_catalog.jsonb_typeof(p_value -> 'appliedDefaults') is distinct from 'array' then return false; end if;
  for v_item in select a.value from pg_catalog.jsonb_array_elements(p_value -> 'appliedDefaults') as a(value) loop
    if not public.payr_identity_object_v1(v_item, array['field','value','source']) then return false; end if;
    v_key := v_item ->> 'field';
    if (v_key in ('issueDate','dueDate','payableUntil') and not (v_key = any(v_seen))
      and v_item -> 'value' = p_value -> v_key
      and v_item ->> 'source' = case v_key when 'issueDate' then 'workspace_date' when 'dueDate' then 'sender_terms' else 'technical_deadline' end) is not true then return false; end if;
    v_seen := pg_catalog.array_append(v_seen, v_key);
  end loop;
  return 'payableUntil' = any(v_seen);
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then return false;
end;
$$;

create function public.payr_draft_protect_version_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' and old.draft_snapshot is not null then
    if tg_op = 'DELETE' then raise exception using errcode = '55000', message = 'DRAFT_VERSION_IMMUTABLE'; end if;
    if (pg_catalog.to_jsonb(new) - array['chain_id','contract_address','frozen_at'])
      is distinct from (pg_catalog.to_jsonb(old) - array['chain_id','contract_address','frozen_at'])
      or (old.chain_id is not null and new.chain_id is distinct from old.chain_id)
      or (old.contract_address is not null and new.contract_address is distinct from old.contract_address)
      or (old.frozen_at is not null and new.frozen_at is distinct from old.frozen_at) then
      raise exception using errcode = '55000', message = 'DRAFT_VERSION_IMMUTABLE';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.draft_snapshot is not null then
    if not public.payr_draft_snapshot_valid_v1(new.draft_snapshot)
      or new.sender_snapshot is distinct from new.draft_snapshot -> 'sender'
      or new.client_snapshot is distinct from new.draft_snapshot -> 'client'
      or new.line_items is distinct from new.draft_snapshot -> 'items'
      or new.memo is distinct from new.draft_snapshot ->> 'memo'
      or new.issue_date is distinct from (new.draft_snapshot ->> 'issueDate')::date
      or new.due_date is distinct from (new.draft_snapshot ->> 'dueDate')::date
      or new.payable_until is distinct from (new.draft_snapshot ->> 'payableUntil')::timestamptz
      or new.amount_decimal is distinct from new.draft_snapshot ->> 'amountDecimal'
      or new.amount_atomic is distinct from (new.draft_snapshot ->> 'amountAtomic')::numeric
      or new.payee is distinct from new.draft_snapshot #>> '{sender,payoutWallet}' then
      raise exception using errcode = '23514', message = 'DRAFT_SNAPSHOT_MISMATCH';
    end if;
  end if;
  return new;
end;
$$;
create trigger invoice_versions_draft_immutable before insert or update or delete on public.invoice_versions
  for each row execute function public.payr_draft_protect_version_v1();

create function public.payr_draft_version_dto_v1(p_row public.invoice_versions)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p_row.id is null or p_row.draft_snapshot is null then 'null'::jsonb else pg_catalog.jsonb_build_object(
    'id', p_row.id, 'draftId', p_row.invoice_id, 'version', p_row.version_number, 'snapshot', p_row.draft_snapshot, 'createdAt', p_row.created_at) end;
$$;

create function public.payr_find_draft_replay_v1(p_workspace_id uuid, p_owner_wallet text, p_connector_id uuid,
  p_idempotency_key text, p_request_fingerprint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request public.idempotency_requests; v_result jsonb;
begin
  perform public.payr_draft_scope_v1(p_workspace_id, p_owner_wallet, p_connector_id, 'invoice:draft');
  if not public.payr_draft_text_v1(pg_catalog.to_jsonb(p_idempotency_key), 128)
    or p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  select r.* into v_request from public.idempotency_requests as r where r.workspace_id = p_workspace_id
    and r.operation = 'create_invoice_draft' and r.idempotency_key = p_idempotency_key;
  if not found then return 'null'::jsonb; end if;
  if v_request.request_fingerprint <> p_request_fingerprint then
    raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
  end if;
  select public.payr_draft_version_dto_v1(v) into v_result from public.invoice_versions as v
    where v.workspace_id = p_workspace_id and v.id = (v_request.result_descriptor #>> '{ids,version_id}')::uuid
      and v.invoice_id = (v_request.result_descriptor #>> '{ids,invoice_id}')::uuid;
  if v_result is null or v_result = 'null'::jsonb or v_request.completed_at is null then
    raise exception using errcode = 'P0001', message = 'INVALID_DRAFT_DESCRIPTOR';
  end if;
  return v_result;
end;
$$;

create function public.payr_get_draft_context_v1(p_workspace_id uuid, p_owner_wallet text, p_connector_id uuid,
  p_draft_id uuid, p_client_id uuid, p_client_alias text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sender public.sender_profiles; v_client public.clients; v_invoice public.invoices; v_version public.invoice_versions;
begin
  perform public.payr_draft_scope_v1(p_workspace_id, p_owner_wallet, p_connector_id, 'invoice:draft');
  if p_client_alias is not null and not public.payr_draft_text_v1(pg_catalog.to_jsonb(p_client_alias), 100) then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  if p_draft_id is not null then
    select i.* into v_invoice from public.invoices as i where i.workspace_id = p_workspace_id and i.id = p_draft_id;
    if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
    select v.* into v_version from public.invoice_versions as v where v.workspace_id = p_workspace_id
      and v.invoice_id = p_draft_id and v.version_number = v_invoice.current_version;
  end if;
  if p_client_id is not null or p_client_alias is not null then
    select c.* into v_client from public.clients as c where c.workspace_id = p_workspace_id
      and (p_client_id is null or c.id = p_client_id) and (p_client_alias is null or c.alias = p_client_alias);
    if not found and p_client_id is not null then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  elsif v_version.draft_snapshot #>> '{clientReference,id}' is not null then
    select c.* into v_client from public.clients as c where c.workspace_id = p_workspace_id
      and c.id = (v_version.draft_snapshot #>> '{clientReference,id}')::uuid;
  end if;
  select s.* into v_sender from public.sender_profiles as s where s.workspace_id = p_workspace_id;
  return pg_catalog.jsonb_build_object('sender', case when v_sender.payout_wallet is null then 'null'::jsonb else public.payr_identity_profile_dto_v1(v_sender) end,
    'client', case when v_client.id is null then 'null'::jsonb else public.payr_identity_client_dto_v1(v_client) end,
    'previous', public.payr_draft_version_dto_v1(v_version), 'commercialState', v_invoice.commercial_state);
end;
$$;

create function public.payr_save_invoice_draft_v1(p_workspace_id uuid, p_owner_wallet text, p_connector_id uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_snapshot jsonb; v_replay jsonb; v_default jsonb; v_sender public.sender_profiles; v_client public.clients;
  v_invoice public.invoices; v_version public.invoice_versions; v_id uuid; v_key text; v_client_dto jsonb;
begin
  perform public.payr_draft_scope_v1(p_workspace_id, p_owner_wallet, p_connector_id, 'invoice:draft');
  if not public.payr_identity_object_v1(p_input, array['draftId','expectedVersion','idempotencyKey','requestFingerprint','snapshot'])
    or not public.payr_draft_text_v1(p_input -> 'idempotencyKey', 128)
    or (pg_catalog.jsonb_typeof(p_input -> 'requestFingerprint') = 'string'
      and p_input ->> 'requestFingerprint' ~ '^[0-9a-f]{64}$') is not true
    or not public.payr_draft_snapshot_valid_v1(p_input -> 'snapshot') then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  if p_input -> 'draftId' = 'null'::jsonb then
    if p_input -> 'expectedVersion' <> 'null'::jsonb then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
  elsif (pg_catalog.jsonb_typeof(p_input -> 'draftId') = 'string'
    and p_input ->> 'draftId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and pg_catalog.jsonb_typeof(p_input -> 'expectedVersion') = 'number' and p_input ->> 'expectedVersion' ~ '^[1-9][0-9]{0,9}$'
    and (p_input ->> 'expectedVersion')::numeric <= 2147483647) is not true then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  -- Lock the key without persisting a reservation. Replays precede all mutable resolution/CAS checks.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'payr:create_invoice_draft:' || p_workspace_id::text || ':' || (p_input ->> 'idempotencyKey'), 0));
  v_replay := public.payr_find_draft_replay_v1(p_workspace_id, p_owner_wallet, p_connector_id,
    p_input ->> 'idempotencyKey', p_input ->> 'requestFingerprint');
  if v_replay <> 'null'::jsonb then return v_replay; end if;
  v_id := (p_input ->> 'draftId')::uuid;
  if v_id is not null then
    select i.* into v_invoice from public.invoices as i where i.workspace_id = p_workspace_id and i.id = v_id for update;
    if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
    if v_invoice.current_version <> (p_input ->> 'expectedVersion')::integer then
      raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT', detail = pg_catalog.jsonb_build_object(
        'draftId', v_id, 'currentVersion', v_invoice.current_version)::text;
    end if;
    select v.* into v_version from public.invoice_versions as v where v.workspace_id = p_workspace_id
      and v.invoice_id = v_id and v.version_number = v_invoice.current_version;
    if v_invoice.commercial_state <> 'draft' or v_invoice.current_version = 2147483647
      or v_version.draft_snapshot is null or v_version.frozen_at is not null then
      raise exception using errcode = 'P0001', message = 'DRAFT_NOT_EDITABLE';
    end if;
  end if;
  v_snapshot := p_input -> 'snapshot';
  select s.* into v_sender from public.sender_profiles as s where s.workspace_id = p_workspace_id for share;
  if not found or public.payr_identity_profile_dto_v1(v_sender) is distinct from v_snapshot -> 'sender' then
    raise exception using errcode = 'P0001', message = 'PROFILE_CONFLICT';
  end if;
  for v_default in select a.value from pg_catalog.jsonb_array_elements(v_snapshot -> 'appliedDefaults') as a(value) loop
    if v_default ->> 'field' = 'dueDate'
      and (v_sender.default_terms is null or (v_snapshot ->> 'dueDate')::date <> (v_snapshot ->> 'issueDate')::date + v_sender.default_terms::integer)
      and not coalesce(v_version.draft_snapshot -> 'appliedDefaults' @> pg_catalog.jsonb_build_array(v_default), false) then
      raise exception using errcode = '22023', message = 'INVALID_INPUT';
    end if;
  end loop;
  if v_snapshot #>> '{clientReference,id}' is not null then
    select c.* into v_client from public.clients as c where c.workspace_id = p_workspace_id
      and c.id = (v_snapshot #>> '{clientReference,id}')::uuid for share;
    if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
    if v_client.revision <> (v_snapshot #>> '{clientReference,revision}')::integer
      or v_client.alias is distinct from v_snapshot #>> '{clientReference,alias}' then
      raise exception using errcode = 'P0001', message = 'PROFILE_CONFLICT';
    end if;
    v_client_dto := public.payr_identity_client_dto_v1(v_client);
    foreach v_key in array array['businessName','billingAddress','contactName','contactEmail'] loop
      if not (v_snapshot #> '{proposedClientChanges,fields}' ? v_key)
        and v_snapshot -> 'client' -> v_key is distinct from v_client_dto -> v_key then
        raise exception using errcode = 'P0001', message = 'PROFILE_CONFLICT';
      end if;
      if (v_snapshot #> '{proposedClientChanges,fields}' ? v_key)
        and v_snapshot -> 'client' -> v_key is not distinct from v_client_dto -> v_key then
        raise exception using errcode = '22023', message = 'INVALID_INPUT';
      end if;
    end loop;
  elsif v_snapshot #>> '{clientReference,alias}' is not null and exists (
    select 1 from public.clients as c where c.workspace_id = p_workspace_id and c.alias = v_snapshot #>> '{clientReference,alias}') then
    raise exception using errcode = 'P0001', message = 'PROFILE_CONFLICT';
  end if;
  -- Expiry can pass while waiting on an invoice/profile; recheck after all lock waits.
  perform public.payr_draft_scope_v1(p_workspace_id, p_owner_wallet, p_connector_id, 'invoice:draft');
  if v_id is null then
    v_id := pg_catalog.gen_random_uuid();
    insert into public.invoices (id,workspace_id,client_id) values (v_id,p_workspace_id,v_client.id) returning * into v_invoice;
  else
    update public.invoices set current_version = current_version + 1, client_id = v_client.id, updated_at = pg_catalog.clock_timestamp()
      where workspace_id = p_workspace_id and id = v_id returning * into v_invoice;
  end if;
  insert into public.invoice_versions (id,workspace_id,invoice_id,version_number,draft_snapshot,sender_snapshot,client_snapshot,
    line_items,memo,issue_date,due_date,payable_until,payable_until_second,amount_decimal,amount_atomic,payee)
    values (pg_catalog.gen_random_uuid(),p_workspace_id,v_id,v_invoice.current_version,v_snapshot,v_snapshot -> 'sender',v_snapshot -> 'client',
      v_snapshot -> 'items',v_snapshot ->> 'memo',(v_snapshot ->> 'issueDate')::date,(v_snapshot ->> 'dueDate')::date,
      (v_snapshot ->> 'payableUntil')::timestamptz,extract(epoch from (v_snapshot ->> 'payableUntil')::timestamptz)::bigint,
      v_snapshot ->> 'amountDecimal',(v_snapshot ->> 'amountAtomic')::numeric,v_snapshot #>> '{sender,payoutWallet}') returning * into v_version;
  insert into public.idempotency_requests (id,workspace_id,operation,idempotency_key,request_fingerprint,result_descriptor,completed_at)
    values (pg_catalog.gen_random_uuid(),p_workspace_id,'create_invoice_draft',p_input ->> 'idempotencyKey',p_input ->> 'requestFingerprint',
      pg_catalog.jsonb_build_object('ids',pg_catalog.jsonb_build_object('invoice_id',v_id,'version_id',v_version.id),'state','draft_ready'),pg_catalog.clock_timestamp());
  return public.payr_draft_version_dto_v1(v_version);
end;
$$;

revoke all on function public.payr_draft_scope_v1(uuid,text,uuid,text), public.payr_draft_text_v1(jsonb,integer,integer),
  public.payr_draft_billing_v1(jsonb), public.payr_draft_provenance_v1(jsonb), public.payr_draft_money_v1(jsonb),
  public.payr_draft_snapshot_valid_v1(jsonb), public.payr_draft_protect_version_v1(), public.payr_draft_version_dto_v1(public.invoice_versions),
  public.payr_find_draft_replay_v1(uuid,text,uuid,text,text), public.payr_get_draft_context_v1(uuid,text,uuid,uuid,uuid,text),
  public.payr_save_invoice_draft_v1(uuid,text,uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.payr_find_draft_replay_v1(uuid,text,uuid,text,text),
  public.payr_get_draft_context_v1(uuid,text,uuid,uuid,uuid,text), public.payr_save_invoice_draft_v1(uuid,text,uuid,jsonb) to service_role;

create function public.payr_invoice_summary_v1(p_invoice public.invoices, p_version public.invoice_versions, p_settled boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_state public.commercial_state;
begin
  v_state := case when p_invoice.commercial_state = 'published' and p_invoice.payable_until <= pg_catalog.statement_timestamp()
    then 'expired'::public.commercial_state else p_invoice.commercial_state end;
  return pg_catalog.jsonb_build_object('id',p_invoice.id,'invoiceNumber',p_invoice.invoice_number,'version',p_invoice.current_version,
    'clientName',p_version.client_snapshot ->> 'businessName','amountDecimal',p_version.amount_decimal,
    'amountAtomic',p_version.amount_atomic::text,'issueDate',p_version.issue_date,'dueDate',p_version.due_date,
    'payableUntil',p_version.payable_until,'commercialState',v_state,'paymentStatus',case when p_settled then 'paid' else 'unpaid' end,
    'displayStatus',case when p_settled then 'Paid' else pg_catalog.initcap(v_state::text) end,'updatedAt',p_invoice.updated_at);
end;
$$;

create function public.payr_invoice_summaries_v1(p_workspace_id uuid)
returns table (id uuid, updated_at timestamptz, summary jsonb)
language sql stable security definer set search_path = '' as $$
  select i.id, i.updated_at, public.payr_invoice_summary_v1(i,v,exists (
    select 1 from public.settlements as s where s.workspace_id = i.workspace_id and s.invoice_id = i.id))
  from public.invoices as i left join public.invoice_versions as v on v.workspace_id = i.workspace_id
    and v.invoice_id = i.id and v.version_number = i.current_version
  where i.workspace_id = p_workspace_id;
$$;

create function public.payr_list_invoices_v1(p_workspace_id uuid, p_owner_wallet text, p_connector_id uuid,
  p_search text, p_commercial_state text, p_limit integer, p_offset integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_items jsonb;
begin
  perform public.payr_draft_scope_v1(p_workspace_id,p_owner_wallet,p_connector_id,'invoice:status');
  if not public.payr_draft_text_v1(pg_catalog.to_jsonb(p_search),200,0) or p_limit is null or p_limit not between 1 and 50
    or p_offset is null or p_offset < 0 or (p_commercial_state is not null and p_commercial_state not in ('draft','published','voided','expired')) then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  select coalesce(pg_catalog.jsonb_agg(q.summary order by q.updated_at desc,q.id desc),'[]'::jsonb) into v_items from (
    select s.* from public.payr_invoice_summaries_v1(p_workspace_id) as s
    where (p_commercial_state is null or s.summary ->> 'commercialState' = p_commercial_state)
      and (p_search = '' or pg_catalog.strpos(pg_catalog.lower(coalesce(s.summary ->> 'clientName','')),pg_catalog.lower(p_search)) > 0
        or pg_catalog.strpos(pg_catalog.lower(coalesce(s.summary ->> 'invoiceNumber','')),pg_catalog.lower(p_search)) > 0)
    order by s.updated_at desc,s.id desc limit p_limit + 1 offset p_offset
  ) as q;
  return pg_catalog.jsonb_build_object('items',case when pg_catalog.jsonb_array_length(v_items) > p_limit then v_items - p_limit else v_items end,
    'hasMore',pg_catalog.jsonb_array_length(v_items) > p_limit);
end;
$$;

create function public.payr_get_invoice_detail_v1(p_workspace_id uuid, p_owner_wallet text, p_connector_id uuid, p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public.payr_draft_scope_v1(p_workspace_id,p_owner_wallet,p_connector_id,'invoice:status');
  if p_invoice_id is null then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
  select pg_catalog.jsonb_build_object('invoice',public.payr_invoice_summary_v1(i,v,exists (
    select 1 from public.settlements as s where s.workspace_id = p_workspace_id and s.invoice_id = p_invoice_id)),
    'version',public.payr_draft_version_dto_v1(v),'history',(
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',h.id,'version',h.version_number,'createdAt',h.created_at)
        order by h.version_number desc),'[]'::jsonb) from public.invoice_versions as h
        where h.workspace_id = p_workspace_id and h.invoice_id = p_invoice_id)) into v_result
  from public.invoices as i left join public.invoice_versions as v on v.workspace_id = i.workspace_id
    and v.invoice_id = i.id and v.version_number = i.current_version
  where i.workspace_id = p_workspace_id and i.id = p_invoice_id;
  return coalesce(v_result,'null'::jsonb);
end;
$$;

create function public.payr_get_invoice_overview_v1(p_workspace_id uuid, p_owner_wallet text, p_connector_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sender public.sender_profiles; v_sender_json jsonb; v_attention jsonb; v_latest jsonb; v_counts jsonb;
begin
  perform public.payr_draft_scope_v1(p_workspace_id,p_owner_wallet,p_connector_id,'invoice:status');
  select s.* into v_sender from public.sender_profiles as s where s.workspace_id = p_workspace_id;
  v_sender_json := coalesce(nullif(public.payr_identity_profile_dto_v1(v_sender),'null'::jsonb),'{}'::jsonb);
  select pg_catalog.jsonb_build_object('invoiceCount',pg_catalog.count(*),
    'draftCount',pg_catalog.count(*) filter (where s.summary ->> 'commercialState' = 'draft'),
    -- Expiry ends technical payability, not the commercial receivable. Drafts/voids/settled invoices are excluded.
    'receivablesAtomic',coalesce(pg_catalog.sum((s.summary ->> 'amountAtomic')::numeric) filter (
      where s.summary ->> 'commercialState' in ('published','expired') and s.summary ->> 'paymentStatus' = 'unpaid'),0)::text)
    into v_counts from public.payr_invoice_summaries_v1(p_workspace_id) as s;
  select coalesce(pg_catalog.jsonb_agg(q.summary order by q.priority,q.due_date,q.updated_at desc,q.id desc),'[]'::jsonb)
    into v_attention from (
      select s.*,case s.summary ->> 'commercialState' when 'expired' then 0 when 'published' then 1 else 2 end as priority,
        s.summary ->> 'dueDate' as due_date
      from public.payr_invoice_summaries_v1(p_workspace_id) as s
      where s.summary ->> 'paymentStatus' = 'unpaid' and s.summary ->> 'commercialState' <> 'voided'
      order by priority,due_date,s.updated_at desc,s.id desc limit 50
    ) as q;
  select pg_catalog.jsonb_build_object('invoiceId',s.invoice_id,'invoiceNumber',i.invoice_number,'transactionHash',s.transaction_hash,
    'blockTime',s.block_time,'amountDecimal',pg_catalog.trim_scale(s.amount_atomic * 0.000000000000000001::numeric)::text)
    into v_latest from public.settlements as s join public.invoices as i on i.workspace_id = s.workspace_id and i.id = s.invoice_id
    where s.workspace_id = p_workspace_id order by s.block_time desc,s.id desc limit 1;
  return v_counts || pg_catalog.jsonb_build_object('senderComplete',coalesce(
    public.payr_draft_billing_v1(v_sender_json - array['id','revision','payoutWallet','invoicePrefix','defaultPaymentTermsDays'])
      and v_sender.payout_wallet ~ '^0x[0-9a-f]{40}$' and v_sender.invoice_prefix ~ '^[A-Z0-9][A-Z0-9-]{0,31}$',false),
    'clientCount',(select pg_catalog.count(*) from public.clients as c where c.workspace_id = p_workspace_id),
    'activeConnectorCount',(select pg_catalog.count(*) from public.connector_tokens as t where t.workspace_id = p_workspace_id
      and t.revoked_at is null and t.expires_at > pg_catalog.clock_timestamp()),'attention',v_attention,'latestSettlement',v_latest);
end;
$$;

revoke all on function public.payr_invoice_summary_v1(public.invoices,public.invoice_versions,boolean), public.payr_invoice_summaries_v1(uuid),
  public.payr_list_invoices_v1(uuid,text,uuid,text,text,integer,integer), public.payr_get_invoice_detail_v1(uuid,text,uuid,uuid),
  public.payr_get_invoice_overview_v1(uuid,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.payr_list_invoices_v1(uuid,text,uuid,text,text,integer,integer),
  public.payr_get_invoice_detail_v1(uuid,text,uuid,uuid), public.payr_get_invoice_overview_v1(uuid,text,uuid) to service_role;

commit;
