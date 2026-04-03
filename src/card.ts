import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  HassEntity,
  WatchWardenCardConfig,
  WatchWardenCardContainerConfig,
} from "./types.js";

const DEFAULT_TITLE = "WatchWarden";

export class WatchWardenCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config!: WatchWardenCardConfig;
  @state() private _activeTab = "all";

  public static getConfigElement() {
    return document.createElement("watchwarden-card-editor");
  }

  public static getStubConfig() {
    return {
      title: DEFAULT_TITLE,
      summary_entities: {
        containers_with_updates: "sensor.watchwarden_updates_available",
        unhealthy_containers: "sensor.watchwarden_unhealthy_containers",
        last_check: "sensor.watchwarden_last_check",
        agents_online: "sensor.watchwarden_agents_online",
        agents_total: "sensor.watchwarden_agents_total",
      },
      containers: [],
      appearance: { compact: false, show_health: true, show_rollback: false },
    };
  }

  public setConfig(config: WatchWardenCardConfig): void {
    if (!config.summary_entities) {
      throw new Error("summary_entities is required");
    }
    if (!config.containers || !Array.isArray(config.containers)) {
      throw new Error("containers must be an array");
    }
    this._config = config;
  }

  public getCardSize(): number {
    const rows = this._config?.containers?.length ?? 0;
    return 3 + Math.ceil(rows / (this._config?.appearance?.compact ? 2 : 1));
  }

  // --- Helpers ---

  private _entity(entityId: string | undefined): HassEntity | undefined {
    if (!entityId || !this.hass) return undefined;
    return this.hass.states[entityId];
  }

  private _stateValue(entityId: string | undefined): string {
    const ent = this._entity(entityId);
    if (!ent) return "?";
    if (ent.state === "unavailable" || ent.state === "unknown") return "?";
    return ent.state;
  }

  private _formatTime(entityId: string | undefined): string {
    const ent = this._entity(entityId);
    if (!ent || ent.state === "unavailable" || ent.state === "unknown") return "?";
    try {
      const d = new Date(ent.state);
      if (isNaN(d.getTime())) return ent.state;
      const now = Date.now();
      const diff = now - d.getTime();
      if (diff < 0) return "just now";
      if (diff < 60_000) return "just now";
      if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
      if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
      return `${Math.floor(diff / 86_400_000)}d ago`;
    } catch {
      return ent.state;
    }
  }

  private _shortVersion(v: string): string {
    if (!v || v === "?" || v === "unknown") return "?";
    if (v.includes("@sha256:")) return v.split("@sha256:")[1]?.slice(0, 8) ?? v;
    if (v.startsWith("sha256:")) return v.slice(7, 15);
    return v;
  }

  private _parseService(
    configKey: string | undefined,
    defaultDomain: string,
    defaultService: string,
  ): [string, string] {
    if (configKey?.includes(".")) {
      const [d, s] = configKey.split(".", 2);
      return [d, s];
    }
    return [defaultDomain, defaultService];
  }

  /** Group containers by agent_name from entity attributes */
  private _groupByAgent(): Map<string, WatchWardenCardContainerConfig[]> {
    const groups = new Map<string, WatchWardenCardContainerConfig[]>();
    for (const c of this._config.containers) {
      const ent = this._entity(c.update_entity);
      const agent = ent?.attributes?.agent_name ?? "Unknown";
      const list = groups.get(agent) ?? [];
      list.push(c);
      groups.set(agent, list);
    }
    return groups;
  }

  // --- Actions ---

  private async _checkAll(): Promise<void> {
    const [domain, service] = this._parseService(
      this._config.actions?.check_all_service,
      "watchwarden",
      "check_all",
    );
    await this.hass.callService(domain, service, {});
  }

  private async _checkContainer(container: WatchWardenCardContainerConfig): Promise<void> {
    const ent = this._entity(container.update_entity);
    const containerId = ent?.attributes?.container_id ?? container.update_entity;
    const [domain, service] = this._parseService(
      this._config.actions?.check_container_service,
      "watchwarden",
      "check_container",
    );
    await this.hass.callService(domain, service, { container_id: containerId });
  }

  private async _updateContainer(container: WatchWardenCardContainerConfig): Promise<void> {
    await this.hass.callService("update", "install", {
      entity_id: container.update_entity,
    });
  }

  private async _rollbackContainer(container: WatchWardenCardContainerConfig): Promise<void> {
    const ent = this._entity(container.update_entity);
    const containerId = ent?.attributes?.container_id ?? container.update_entity;
    const [domain, service] = this._parseService(
      this._config.actions?.rollback_container_service,
      "watchwarden",
      "rollback_container",
    );
    await this.hass.callService(domain, service, { container_id: containerId });
  }

  // --- Render ---

  protected render(): TemplateResult {
    if (!this._config || !this.hass) {
      return html`<ha-card><div class="card-content">Loading...</div></ha-card>`;
    }

    const se = this._config.summary_entities;
    const updatesAvailable = parseInt(this._stateValue(se.containers_with_updates), 10) || 0;
    const compact = this._config.appearance?.compact ?? false;
    const showHealth = this._config.appearance?.show_health ?? true;
    const showRollback = this._config.appearance?.show_rollback ?? false;
    const agentGroups = this._groupByAgent();
    const agents = [...agentGroups.keys()].sort();
    const hasTabs = agents.length > 1;

    return html`
      <ha-card>
        ${this._renderHeader(updatesAvailable)}
        <div class="card-content">
          ${this._renderSummary(se)}
          ${this._config.containers.length > 0
            ? html`
                ${hasTabs ? this._renderTabs(agents, agentGroups) : nothing}
                ${this._renderContainerList(
                  hasTabs ? this._getVisibleContainers(agentGroups, agents) : this._config.containers,
                  compact,
                  showHealth,
                  showRollback,
                )}
              `
            : html`<div class="empty">No containers configured</div>`}
        </div>
      </ha-card>
    `;
  }

  private _renderHeader(updatesAvailable: number): TemplateResult {
    const title = this._config.title ?? DEFAULT_TITLE;
    return html`
      <div class="card-header">
        <div class="header-row">
          <span class="title">${title}</span>
          ${updatesAvailable > 0
            ? html`<span class="badge updates">${updatesAvailable}</span>`
            : nothing}
        </div>
      </div>
    `;
  }

  private _renderSummary(
    se: WatchWardenCardConfig["summary_entities"],
  ): TemplateResult {
    return html`
      <div class="summary">
        <div class="summary-grid">
          <div class="stat">
            <span class="stat-value">${this._stateValue(se.containers_with_updates)}</span>
            <span class="stat-label">Updates</span>
          </div>
          <div class="stat">
            <span class="stat-value unhealthy">${this._stateValue(se.unhealthy_containers)}</span>
            <span class="stat-label">Unhealthy</span>
          </div>
          ${se.agents_online
            ? html`
                <div class="stat">
                  <span class="stat-value"
                    >${this._stateValue(se.agents_online)}${se.agents_total
                      ? html`<span class="stat-dim">/${this._stateValue(se.agents_total)}</span>`
                      : nothing}</span
                  >
                  <span class="stat-label">Agents</span>
                </div>
              `
            : nothing}
          <div class="stat">
            <span class="stat-value small">${this._formatTime(se.last_check)}</span>
            <span class="stat-label">Last Check</span>
          </div>
        </div>
        <button class="btn btn-check" @click=${this._checkAll}>Check All</button>
      </div>
    `;
  }

  private _renderTabs(
    agents: string[],
    agentGroups: Map<string, WatchWardenCardContainerConfig[]>,
  ): TemplateResult {
    return html`
      <div class="tabs">
        <button
          class="tab ${this._activeTab === "all" ? "active" : ""}"
          @click=${() => { this._activeTab = "all"; }}
        >
          All
          <span class="tab-count">${this._config.containers.length}</span>
        </button>
        ${agents.map((agent) => {
          const containers = agentGroups.get(agent) ?? [];
          const updateCount = containers.filter((c) => {
            const ent = this._entity(c.update_entity);
            return ent?.state === "on";
          }).length;
          return html`
            <button
              class="tab ${this._activeTab === agent ? "active" : ""}"
              @click=${() => { this._activeTab = agent; }}
            >
              ${agent}
              ${updateCount > 0
                ? html`<span class="tab-count update">${updateCount}</span>`
                : html`<span class="tab-count">${containers.length}</span>`}
            </button>
          `;
        })}
      </div>
    `;
  }

  private _getVisibleContainers(
    agentGroups: Map<string, WatchWardenCardContainerConfig[]>,
    agents: string[],
  ): WatchWardenCardContainerConfig[] {
    if (this._activeTab === "all") return this._config.containers;
    // If the active tab no longer exists, fall back to all
    if (!agents.includes(this._activeTab)) {
      this._activeTab = "all";
      return this._config.containers;
    }
    return agentGroups.get(this._activeTab) ?? [];
  }

  private _renderContainerList(
    containers: WatchWardenCardContainerConfig[],
    compact: boolean,
    showHealth: boolean,
    showRollback: boolean,
  ): TemplateResult {
    return html`
      <div class="containers ${compact ? "compact" : ""}">
        ${containers.map((c) =>
          this._renderContainerRow(c, compact, showHealth, showRollback),
        )}
      </div>
    `;
  }

  private _renderContainerRow(
    container: WatchWardenCardContainerConfig,
    compact: boolean,
    showHealth: boolean,
    showRollback: boolean,
  ): TemplateResult {
    const ent = this._entity(container.update_entity);
    const healthEnt = showHealth ? this._entity(container.health_entity) : undefined;

    if (!ent) {
      return html`
        <div class="row">
          <span class="name">${container.name}</span>
          <span class="missing">Entity not found</span>
        </div>
      `;
    }

    const hasUpdate = ent.state === "on";
    const installed = this._shortVersion(ent.attributes.installed_version ?? "?");
    const latest = this._shortVersion(ent.attributes.latest_version ?? "?");
    const healthState = healthEnt?.state;
    const isHealthy =
      !healthEnt || healthState === "on" || healthState === "unavailable" || healthState === "unknown";
    const healthLabel = !healthEnt
      ? undefined
      : healthState === "on"
        ? "healthy"
        : healthState === "unavailable" || healthState === "unknown"
          ? "unknown"
          : "unhealthy";

    return html`
      <div class="row ${hasUpdate ? "has-update" : ""} ${!isHealthy ? "unhealthy-row" : ""}">
        <div class="row-info">
          ${showHealth && healthEnt
            ? html`<span class="health-dot ${healthLabel === "healthy" ? "ok" : healthLabel === "unhealthy" ? "bad" : "neutral"}" title="${healthLabel}"></span>`
            : nothing}
          <span class="name">${container.name}</span>
          ${!compact
            ? html`
                <span class="version">${installed}${hasUpdate ? html` &rarr; ${latest}` : nothing}</span>
              `
            : nothing}
          ${hasUpdate
            ? html`<span class="update-badge">update</span>`
            : html`<span class="ok-badge">up to date</span>`}
        </div>
        <div class="row-actions">
          <button class="btn btn-sm" @click=${() => this._checkContainer(container)} title="Check">
            <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
          </button>
          ${hasUpdate
            ? html`
                <button class="btn btn-sm btn-primary" @click=${() => this._updateContainer(container)} title="Update">
                  <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/></svg>
                </button>
              `
            : nothing}
          ${showRollback
            ? html`
                <button class="btn btn-sm" @click=${() => this._rollbackContainer(container)} title="Rollback">
                  <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
                </button>
              `
            : nothing}
        </div>
      </div>
    `;
  }

  // --- Styles ---

  static styles = css`
    :host {
      --ww-primary: var(--primary-color, #4fc3f7);
      --ww-success: var(--success-color, #66bb6a);
      --ww-warning: var(--warning-color, #ffa726);
      --ww-error: var(--error-color, #ef5350);
      --ww-bg: var(--card-background-color, #1e1e2e);
      --ww-text: var(--primary-text-color, #e0e0e0);
      --ww-text-dim: var(--secondary-text-color, #9e9e9e);
      --ww-border: var(--divider-color, rgba(255, 255, 255, 0.08));
    }

    .card-header {
      padding: 16px 16px 0;
    }
    .header-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .title {
      font-size: 1.1em;
      font-weight: 500;
      color: var(--ww-text);
    }
    .badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 10px;
      color: white;
    }
    .badge.updates {
      background: var(--ww-primary);
    }

    .card-content {
      padding: 12px 16px 16px;
    }

    /* Summary */
    .summary {
      margin-bottom: 12px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
      gap: 8px;
      margin-bottom: 10px;
    }
    .stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 6px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.04);
    }
    .stat-value {
      font-size: 1.3em;
      font-weight: 600;
      color: var(--ww-text);
    }
    .stat-value.small {
      font-size: 0.85em;
      font-weight: 500;
    }
    .stat-value.unhealthy:not([data-zero]) {
      color: var(--ww-error);
    }
    .stat-dim {
      font-weight: 400;
      opacity: 0.5;
    }
    .stat-label {
      font-size: 0.7em;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--ww-text-dim);
      margin-top: 2px;
    }

    /* Tabs */
    .tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 10px;
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .tabs::-webkit-scrollbar {
      display: none;
    }
    .tab {
      cursor: pointer;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      padding: 6px 12px;
      color: var(--ww-text-dim);
      background: rgba(255, 255, 255, 0.04);
      transition: all 0.15s;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .tab:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--ww-text);
    }
    .tab.active {
      background: var(--ww-primary);
      color: #000;
      font-weight: 600;
    }
    .tab-count {
      font-size: 10px;
      padding: 0 5px;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.15);
      line-height: 1.6;
    }
    .tab.active .tab-count {
      background: rgba(0, 0, 0, 0.2);
    }
    .tab-count.update {
      background: var(--ww-primary);
      color: #000;
    }
    .tab.active .tab-count.update {
      background: rgba(0, 0, 0, 0.3);
      color: white;
    }

    /* Buttons */
    .btn {
      cursor: pointer;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      padding: 6px 14px;
      color: var(--ww-text);
      background: rgba(255, 255, 255, 0.08);
      transition: background 0.15s;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .btn:hover {
      background: rgba(255, 255, 255, 0.15);
    }
    .btn-check {
      width: 100%;
      justify-content: center;
      padding: 8px;
    }
    .btn-sm {
      padding: 4px 6px;
    }
    .btn-primary {
      background: var(--ww-primary);
      color: #000;
    }
    .btn-primary:hover {
      opacity: 0.85;
    }

    /* Containers */
    .containers {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      border-radius: 6px;
      transition: background 0.15s;
    }
    .row:hover {
      background: rgba(255, 255, 255, 0.04);
    }
    .row.has-update {
      background: rgba(79, 195, 247, 0.06);
    }
    .row.unhealthy-row {
      border-left: 3px solid var(--ww-error);
    }
    .row-info {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex: 1;
    }
    .row-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .name {
      font-size: 13px;
      font-weight: 500;
      color: var(--ww-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .version {
      font-size: 11px;
      color: var(--ww-text-dim);
      white-space: nowrap;
      font-family: monospace;
    }
    .update-badge {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 4px;
      background: var(--ww-primary);
      color: #000;
      font-weight: 600;
      white-space: nowrap;
    }
    .ok-badge {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(102, 187, 106, 0.15);
      color: var(--ww-success);
      white-space: nowrap;
    }
    .health-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .health-dot.ok {
      background: var(--ww-success);
    }
    .health-dot.bad {
      background: var(--ww-error);
    }
    .health-dot.neutral {
      background: var(--ww-text-dim);
    }
    .missing {
      font-size: 11px;
      color: var(--ww-error);
      font-style: italic;
    }
    .empty {
      text-align: center;
      padding: 16px;
      color: var(--ww-text-dim);
      font-size: 13px;
    }

    /* Compact mode */
    .containers.compact .row {
      padding: 5px 8px;
    }
    .containers.compact .name {
      font-size: 12px;
    }
  `;
}
