/* eslint-disable @typescript-eslint/no-explicit-any */

// --- Home Assistant type stubs ---

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  callService(domain: string, service: string, data?: Record<string, any>): Promise<void>;
  formatEntityState(entity: HassEntity): string;
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
}

// --- Card config ---

export interface WatchWardenCardSummaryEntities {
  containers_total?: string;
  containers_with_updates: string;
  unhealthy_containers: string;
  last_check: string;
  agents_online?: string;
  agents_total?: string;
}

export interface WatchWardenCardContainerConfig {
  name: string;
  update_entity: string;
  health_entity?: string;
}

export interface WatchWardenCardActionsConfig {
  check_all_service?: string;
  check_container_service?: string;
  update_container_service?: string;
  rollback_container_service?: string;
}

export interface WatchWardenCardAppearanceConfig {
  compact?: boolean;
  show_health?: boolean;
  show_rollback?: boolean;
}

export interface WatchWardenCardConfig {
  type: string;
  title?: string;
  summary_entities: WatchWardenCardSummaryEntities;
  containers: WatchWardenCardContainerConfig[];
  actions?: WatchWardenCardActionsConfig;
  appearance?: WatchWardenCardAppearanceConfig;
}

// --- Global HA custom card registration ---

declare global {
  interface Window {
    customCards?: Array<{
      type: string;
      name: string;
      description: string;
      preview?: boolean;
      documentationURL?: string;
    }>;
  }
}
