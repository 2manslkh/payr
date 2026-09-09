export type LocalTestConfig = {
  projectId: string;
  apiPort: number;
  dbPort: number;
  shadowPort: number;
  container: string;
  isolated: boolean;
};
export function localTestConfig(env?: NodeJS.ProcessEnv): LocalTestConfig;
export function localDockerHost(env?: NodeJS.ProcessEnv): string;
export function validateLocalUrls(config: LocalTestConfig, env: NodeJS.ProcessEnv): void;
export function fixtureDatabaseContainer(env?: NodeJS.ProcessEnv): string;
