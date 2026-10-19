/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PROXY_URL?: string;
  readonly VITE_BASE_PATH?: string;
}

declare module '*?worker&url' {
  const url: string;
  export default url;
}

declare module '*?worker' {
  const WorkerCtor: new () => Worker;
  export default WorkerCtor;
}
