interface IConfig {
  // Authentication
  pass?: string;
  user?: string;
  // Disables
  cache?: boolean;
  merge?: boolean;
  episodes?: string;
  // Settings
  format?: string;
  output?: string;
  series?: string;
  nametmpl?: string;
  tag?: string;
  resolution?: string;
  video_format?: string;
  video_quality?: string;
  rebuildcrp?: boolean;
  batch?: string;
  verbose?: boolean;
  debug?: boolean;
  retry?: number;
}
