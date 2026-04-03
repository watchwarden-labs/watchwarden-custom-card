import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HomeAssistant, WatchWardenCardConfig } from "./types.js";

const DEFAULTS: WatchWardenCardConfig = {
  type: "custom:watchwarden-card",
  title: "WatchWarden",
  summary_entities: {
    containers_with_updates: "",
    unhealthy_containers: "",
    last_check: "",
  },
  containers: [],
  appearance: { compact: false, show_health: true, show_rollback: false },
};

interface DiscoveredContainer {
  name: string;
  update_entity: string;
  health_entity?: string;
}

export class WatchWardenCardEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config: WatchWardenCardConfig = { ...DEFAULTS };

  public setConfig(config: WatchWardenCardConfig): void {
    this._config = { ...DEFAULTS, ...config };
  }

  private _dispatch(): void {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Find all WatchWarden update entities by checking for container_id attribute */
  private _discoverContainers(): DiscoveredContainer[] {
    if (!this.hass) return [];
    const containers: DiscoveredContainer[] = [];

    for (const entityId of Object.keys(this.hass.states)) {
      if (!entityId.startsWith("update.")) continue;

      const ent = this.hass.states[entityId];
      // WatchWarden update entities have container_id and agent_id attributes
      if (!ent.attributes.container_id || !ent.attributes.agent_id) continue;

      const name =
        ent.attributes.title ??
        ent.attributes.friendly_name?.replace(/ Update$/, "") ??
        entityId.replace("update.", "");

      // Try to find matching health entity
      const baseName = entityId.replace("update.", "");
      const healthId = `binary_sensor.${baseName}_health`;
      const healthEntity = this.hass.states[healthId] ? healthId : undefined;

      containers.push({ name, update_entity: entityId, health_entity: healthEntity });
    }

    return containers.sort((a, b) => a.name.localeCompare(b.name));
  }

  private _isContainerSelected(updateEntity: string): boolean {
    return this._config.containers.some((c) => c.update_entity === updateEntity);
  }

  private _toggleContainer(container: DiscoveredContainer): void {
    const existing = this._config.containers.findIndex(
      (c) => c.update_entity === container.update_entity,
    );
    let containers;
    if (existing >= 0) {
      containers = this._config.containers.filter((_, i) => i !== existing);
    } else {
      containers = [...this._config.containers, container];
    }
    this._config = { ...this._config, containers };
    this._dispatch();
  }

  private _updateField(field: string, value: string): void {
    this._config = { ...this._config, [field]: value };
    this._dispatch();
  }

  private _updateSummaryEntity(key: string, value: string): void {
    this._config = {
      ...this._config,
      summary_entities: { ...this._config.summary_entities, [key]: value },
    };
    this._dispatch();
  }

  private _updateAppearance(key: string, value: boolean): void {
    this._config = {
      ...this._config,
      appearance: { ...this._config.appearance, [key]: value },
    };
    this._dispatch();
  }

  protected render(): TemplateResult {
    const se = this._config.summary_entities;
    const app = this._config.appearance ?? {};
    const discovered = this._discoverContainers();

    return html`
      <div class="editor">
        <div class="field">
          <label>Title</label>
          <input
            type="text"
            .value=${this._config.title ?? ""}
            @input=${(e: InputEvent) => this._updateField("title", (e.target as HTMLInputElement).value)}
          />
        </div>

        <h3>Summary Entities</h3>
        ${this._entityField("Updates available", se.containers_with_updates, (v) =>
          this._updateSummaryEntity("containers_with_updates", v),
        )}
        ${this._entityField("Unhealthy containers", se.unhealthy_containers, (v) =>
          this._updateSummaryEntity("unhealthy_containers", v),
        )}
        ${this._entityField("Last check", se.last_check, (v) =>
          this._updateSummaryEntity("last_check", v),
        )}
        ${this._entityField("Agents online", se.agents_online ?? "", (v) =>
          this._updateSummaryEntity("agents_online", v),
        )}
        ${this._entityField("Agents total", se.agents_total ?? "", (v) =>
          this._updateSummaryEntity("agents_total", v),
        )}

        <h3>Appearance</h3>
        <label class="checkbox">
          <input
            type="checkbox"
            .checked=${app.compact ?? false}
            @change=${(e: Event) => this._updateAppearance("compact", (e.target as HTMLInputElement).checked)}
          />
          Compact mode
        </label>
        <label class="checkbox">
          <input
            type="checkbox"
            .checked=${app.show_health ?? true}
            @change=${(e: Event) => this._updateAppearance("show_health", (e.target as HTMLInputElement).checked)}
          />
          Show health indicators
        </label>
        <label class="checkbox">
          <input
            type="checkbox"
            .checked=${app.show_rollback ?? false}
            @change=${(e: Event) => this._updateAppearance("show_rollback", (e.target as HTMLInputElement).checked)}
          />
          Show rollback button
        </label>

        <h3>Containers</h3>
        ${discovered.length > 0
          ? html`
              <p class="hint">Select containers to display on the card:</p>
              <div class="container-list">
                ${discovered.map((c) => this._containerCheckbox(c))}
              </div>
            `
          : html`<p class="hint">No WatchWarden update entities found. Make sure the integration is set up.</p>`}

        ${this._config.containers.some((c) => !discovered.find((d) => d.update_entity === c.update_entity))
          ? html`
              <h3>Custom Containers</h3>
              <p class="hint">Manually configured containers not found in auto-discovery:</p>
              ${this._config.containers
                .filter((c) => !discovered.find((d) => d.update_entity === c.update_entity))
                .map((c) => html`<div class="custom-entry">${c.name} (${c.update_entity})</div>`)}
            `
          : nothing}
      </div>
    `;
  }

  private _containerCheckbox(container: DiscoveredContainer): TemplateResult {
    const selected = this._isContainerSelected(container.update_entity);
    return html`
      <label class="container-item ${selected ? "selected" : ""}">
        <input
          type="checkbox"
          .checked=${selected}
          @change=${() => this._toggleContainer(container)}
        />
        <div class="container-info">
          <span class="container-name">${container.name}</span>
          <span class="container-entity">${container.update_entity}</span>
        </div>
        ${container.health_entity
          ? html`<span class="health-tag">health</span>`
          : nothing}
      </label>
    `;
  }

  private _entityField(
    label: string,
    value: string,
    onChange: (v: string) => void,
  ): TemplateResult {
    return html`
      <div class="field">
        <label>${label}</label>
        <input
          type="text"
          .value=${value}
          @input=${(e: InputEvent) => onChange((e.target as HTMLInputElement).value)}
          placeholder="sensor.watchwarden_..."
        />
      </div>
    `;
  }

  static styles = css`
    .editor {
      padding: 8px;
    }
    h3 {
      font-size: 13px;
      font-weight: 600;
      margin: 16px 0 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.7;
    }
    .hint {
      font-size: 12px;
      color: var(--secondary-text-color, #9e9e9e);
      margin: 0 0 8px;
    }
    .field {
      margin-bottom: 8px;
    }
    .field label {
      display: block;
      font-size: 12px;
      margin-bottom: 4px;
      opacity: 0.8;
    }
    .field input {
      width: 100%;
      box-sizing: border-box;
      padding: 6px 8px;
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.1));
      border-radius: 4px;
      background: var(--card-background-color, #1e1e2e);
      color: var(--primary-text-color, #e0e0e0);
      font-size: 13px;
    }
    .checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      margin-bottom: 6px;
      cursor: pointer;
    }

    /* Container discovery list */
    .container-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .container-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .container-item:hover {
      background: rgba(255, 255, 255, 0.04);
    }
    .container-item.selected {
      border-color: var(--primary-color, #4fc3f7);
      background: rgba(79, 195, 247, 0.08);
    }
    .container-item input[type="checkbox"] {
      flex-shrink: 0;
    }
    .container-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    .container-name {
      font-size: 13px;
      font-weight: 500;
    }
    .container-entity {
      font-size: 11px;
      opacity: 0.5;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .health-tag {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(102, 187, 106, 0.15);
      color: var(--success-color, #66bb6a);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .custom-entry {
      font-size: 12px;
      padding: 4px 8px;
      opacity: 0.6;
    }
  `;
}
