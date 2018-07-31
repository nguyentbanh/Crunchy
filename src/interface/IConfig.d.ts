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
  unlog?: boolean;
  retry?: number;
  // Login options
  logUsingApi?: boolean;
  crSessionUrl?: string;
  crDeviceType?: string;
  crAPIVersion?: string;
  crLocale?: string;
  crSessionKey?: string;
  crLoginUrl?: string;
  // Generated values
  crDeviceId?: string;
  crSessionId?: string;
}
