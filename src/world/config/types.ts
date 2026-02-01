export interface GatewayConfig {
  port?: number;
  host?: string;
  bind?: "loopback" | "lan" | "auto";
}

export interface AgentEntry {
  id: string;
  default?: boolean;
  name?: string;
  land?: string;
  defaultModel?: string;
  defaultProvider?: "anthropic" | "openai" | "openrouter";
  temperature?: number;
}

export interface AgentBinding {
  agentId: string;
  match: {
    channel?: string;
    accountId?: string;
    peer?: {
      kind: "dm" | "group" | "channel";
      id: string;
    };
    guildId?: string; // Discord
    teamId?: string; // Slack
  };
}

export interface AgentsConfig {
  list?: AgentEntry[];
  defaults?: {
    land?: string;
    defaultModel?: string;
    defaultProvider?: "anthropic" | "openai" | "openrouter";
    temperature?: number;
    timeoutSeconds?: number; // Agent runtime timeout (default: 600s)
  };
}

export interface RoutingConfig {
  bindings?: AgentBinding[];
}

export interface ChannelDefaultsConfig {
  dmPolicy?: "open" | "pairing" | "allowlist";
  groupPolicy?: "open" | "allowlist";
}

export interface WhatsAppConfig {
  enabled?: boolean;
  dmPolicy?: "open" | "pairing" | "allowlist";
  allowFrom?: string[];
  groupPolicy?: "open" | "allowlist";
  groups?: Record<string, { requireMention?: boolean }>;
}

export interface TelegramConfig {
  enabled?: boolean;
  botToken?: string;
  dmPolicy?: "open" | "pairing" | "allowlist";
  allowFrom?: string[];
  groupPolicy?: "open" | "allowlist";
  groups?: Record<string, { requireMention?: boolean }>;
}

export interface DiscordConfig {
  enabled?: boolean;
  token?: string;
  dm?: {
    enabled?: boolean;
    policy?: "open" | "pairing" | "allowlist";
    allowFrom?: string[];
  };
  guilds?: Record<string, {
    slug?: string;
    requireMention?: boolean;
    channels?: Record<string, { allow?: boolean; requireMention?: boolean }>;
  }>;
}

export interface SlackConfig {
  enabled?: boolean;
  botToken?: string;
  appToken?: string;
  channels?: Record<string, { allow?: boolean; requireMention?: boolean }>;
  dm?: {
    enabled?: boolean;
    allowFrom?: string[];
  };
}

export interface SignalConfig {
  enabled?: boolean;
  dmPolicy?: "open" | "pairing" | "allowlist";
  allowFrom?: string[];
}

export interface IMessageConfig {
  enabled?: boolean;
  dmPolicy?: "open" | "pairing" | "allowlist";
  allowFrom?: string[];
  groupPolicy?: "open" | "allowlist";
  groups?: Record<string, { requireMention?: boolean }>;
}

export interface WebChatConfig {
  enabled?: boolean;
}

export interface ChannelsConfig {
  defaults?: ChannelDefaultsConfig;
  whatsapp?: WhatsAppConfig;
  telegram?: TelegramConfig;
  discord?: DiscordConfig;
  slack?: SlackConfig;
  signal?: SignalConfig;
  imessage?: IMessageConfig;
  webchat?: WebChatConfig;
}

export interface LLMConfig {
  anthropic?: {
    apiKey?: string;
    defaultModel?: string;
  };
  openai?: {
    apiKey?: string;
    defaultModel?: string;
  };
  openrouter?: {
    apiKey?: string;
    defaultModel?: string;
  };
}

export interface SecurityConfig {
  sandbox?: {
    mode?: "off" | "non-main" | "all";
    scope?: "per-session" | "per-agent" | "shared";
    workspaceAccess?: "ro" | "rw" | "none";
    docker?: {
      image?: string;
      containerPrefix?: string;
      workdir?: string;
      readOnlyRoot?: boolean;
      network?: "none" | "bridge" | string;
      memory?: string;
      cpus?: number;
      pidsLimit?: number;
    };
  };
  tools?: {
    profile?: "minimal" | "coding" | "messaging" | "full";
    allow?: string[];
    deny?: string[];
    sandbox?: {
      tools?: {
        allow?: string[];
        deny?: string[];
      };
    };
  };
  execution?: {
    allowlist?: string[];
    denylist?: string[];
    timeout?: number;
    maxOutput?: number;
    allowedPaths?: string[];
    blockedPaths?: string[];
  };
  sessions?: {
    main?: {
      sandbox?: boolean;
      tools?: {
        allow?: string[];
        deny?: string[];
      };
    };
    group?: {
      sandbox?: boolean;
      tools?: {
        allow?: string[];
        deny?: string[];
      };
    };
    channel?: {
      sandbox?: boolean;
      tools?: {
        allow?: string[];
        deny?: string[];
      };
    };
  };
  gateway?: {
    auth?: {
      enabled?: boolean;
      tokens?: string[];
    };
    rateLimit?: {
      requestsPerMinute?: number;
    };
  };
}

export interface TextToSpeechConfig {
  provider?: "openai" | "elevenlabs" | "edge";
  enabled?: boolean;
  auto?: "off" | "always" | "inbound" | "tagged";
  maxLength?: number;
  summarize?: boolean;
  openai?: {
    apiKey?: string;
    model?: string;
    voice?: string;
    speed?: number;
  };
  elevenlabs?: {
    apiKey?: string;
    voiceId?: string;
    modelId?: string;
    stability?: number;
    similarityBoost?: number;
    style?: number;
    useSpeakerBoost?: boolean;
    speed?: number;
  };
  edge?: {
    enabled?: boolean;
    voice?: string;
    lang?: string;
    outputFormat?: string;
    pitch?: string;
    rate?: string;
    volume?: string;
  };
}

export interface ZuckermanConfig {
  gateway?: GatewayConfig;
  agents?: AgentsConfig; // Multi-agent config
  routing?: RoutingConfig; // Agent routing bindings
  channels?: ChannelsConfig; // Messaging channels config
  llm?: LLMConfig;
  security?: SecurityConfig;
  textToSpeech?: TextToSpeechConfig;
}
