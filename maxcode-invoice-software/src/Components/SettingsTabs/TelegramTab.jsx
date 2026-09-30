import React from "react";

const getHiddenSecretInputStyle = (value = "") => {
  if (!String(value || "").trim()) return undefined;
  return {
    color: "transparent",
    textShadow: "0 0 6px rgba(33, 37, 41, 0.75)",
    transition: "text-shadow 0.2s ease",
  };
};

const TelegramTab = ({
  handleSaveAll,
  isSaving,
  isBusinessLoading,
  isSuperAdmin,
  businessSettings,
  handleTelegramChange,
  handleTelegramSecretInputChange,
  showTelegramSecret,
  handleTelegramRevealToggle,
  copyTelegramFieldValue,
  webhookUrl,
  onTelegramSetup,
  isTelegramSettingUp,
}) => {
  const config = businessSettings?.telegramSettings || {};

  return (
    <div className="business-details-container">
      <div className="card modern-card mb-4">
        <div className="card-body d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
          <div>
            <h5 className="mb-1 fw-bold">Telegram Payment Notifications</h5>
            <p className="text-muted mb-0">
              Receive UTR verification requests and update payment status from Telegram.
            </p>
          </div>
          <button
            onClick={handleSaveAll}
            disabled={isSaving || isBusinessLoading || !isSuperAdmin}
            className="btn btn-success px-4 py-2 fw-bold d-flex align-items-center gap-2"
          >
            <i className="fas fa-save"></i>
            {isSaving ? "Saving..." : "Save Telegram"}
          </button>
        </div>
      </div>

      <div className="card border-0 shadow-sm rounded-4 p-4 bg-white">
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label fw-bold">Bot Name</label>
            <input className="form-control modern-input" value={config.botName || ""} onChange={(e) => handleTelegramChange("botName", e.target.value)} disabled={!isSuperAdmin} placeholder="My Payment Bot" />
          </div>
          <div className="col-md-6">
            <label className="form-label fw-bold">Bot User Name</label>
            <input className="form-control modern-input" value={config.botUserName || ""} onChange={(e) => handleTelegramChange("botUserName", e.target.value)} disabled={!isSuperAdmin} placeholder="my_payment_bot" />
          </div>
          <div className="col-md-6">
            <label className="form-label fw-bold">Bot Token</label>
            <div className="input-group">
              <input
                type="text"
                className="form-control modern-input"
                value={config.botToken || ""}
                onChange={(e) => handleTelegramSecretInputChange("botToken", e.target.value)}
                disabled={!isSuperAdmin}
                placeholder="123456:ABC..."
                style={
                  showTelegramSecret?.botToken
                    ? undefined
                    : getHiddenSecretInputStyle(config.botToken)
                }
              />
              <button className="btn btn-outline-secondary" type="button" onClick={() => handleTelegramRevealToggle("botToken")} aria-label="Show or hide bot token">
                <i className={`fas fa-eye${showTelegramSecret?.botToken ? "-slash" : ""}`}></i>
              </button>
              <button className="btn btn-outline-primary rounded-end-3" type="button" onClick={() => copyTelegramFieldValue("botToken")}>
                <i className="fas fa-copy"></i>
              </button>
            </div>
          </div>
          <div className="col-md-6">
            <label className="form-label fw-bold">Chat ID</label>
            <div className="input-group">
              <input
                type="text"
                className="form-control modern-input"
                value={config.chatId || ""}
                onChange={(e) => handleTelegramSecretInputChange("chatId", e.target.value)}
                disabled={!isSuperAdmin}
                placeholder="-1001234567890"
                style={
                  showTelegramSecret?.chatId
                    ? undefined
                    : getHiddenSecretInputStyle(config.chatId)
                }
              />
              <button className="btn btn-outline-secondary" type="button" onClick={() => handleTelegramRevealToggle("chatId")} aria-label="Show or hide chat id">
                <i className={`fas fa-eye${showTelegramSecret?.chatId ? "-slash" : ""}`}></i>
              </button>
              <button className="btn btn-outline-primary rounded-end-3" type="button" onClick={() => copyTelegramFieldValue("chatId")}>
                <i className="fas fa-copy"></i>
              </button>
            </div>
          </div>
          <div className="col-md-6">
            <label className="form-label fw-bold">Router Shared Secret</label>
            <div className="input-group">
              <input
                type="text"
                className="form-control modern-input"
                value={config.sharedSecret || ""}
                onChange={(e) => handleTelegramSecretInputChange("sharedSecret", e.target.value)}
                disabled={!isSuperAdmin}
                placeholder="Paste from Telegram Webhook connection"
                style={
                  showTelegramSecret?.sharedSecret
                    ? undefined
                    : getHiddenSecretInputStyle(config.sharedSecret)
                }
              />
              <button className="btn btn-outline-secondary" type="button" onClick={() => handleTelegramRevealToggle("sharedSecret")} aria-label="Show or hide shared secret">
                <i className={`fas fa-eye${showTelegramSecret?.sharedSecret ? "-slash" : ""}`}></i>
              </button>
              <button className="btn btn-outline-primary rounded-end-3" type="button" onClick={() => copyTelegramFieldValue("sharedSecret")}>
                <i className="fas fa-copy"></i>
              </button>
            </div>
            <small className="text-muted">
              Same Shared Secret as the MaxCode Telegram Webhook Software Connection. Enables HMAC verification.
            </small>
          </div>
          <div className="col-md-6">
            <label className="form-label fw-bold">Router Bot ID</label>
            <div className="input-group">
              <input
                type="text"
                className="form-control modern-input"
                value={config.routerBotId || ""}
                onChange={(e) => handleTelegramSecretInputChange("routerBotId", e.target.value)}
                disabled={!isSuperAdmin}
                placeholder="Paste from Telegram Webhook Bot Accounts"
                style={
                  showTelegramSecret?.routerBotId
                    ? undefined
                    : getHiddenSecretInputStyle(config.routerBotId)
                }
              />
              <button className="btn btn-outline-secondary" type="button" onClick={() => handleTelegramRevealToggle("routerBotId")} aria-label="Show or hide router bot id">
                <i className={`fas fa-eye${showTelegramSecret?.routerBotId ? "-slash" : ""}`}></i>
              </button>
              <button className="btn btn-outline-primary rounded-end-3" type="button" onClick={() => copyTelegramFieldValue("routerBotId")}>
                <i className="fas fa-copy"></i>
              </button>
            </div>
          </div>
          <div className="col-md-6">
            <label className="form-label fw-bold">Router Connection ID</label>
            <div className="input-group">
              <input
                type="text"
                className="form-control modern-input"
                value={config.routerConnectionId || ""}
                onChange={(e) => handleTelegramSecretInputChange("routerConnectionId", e.target.value)}
                disabled={!isSuperAdmin}
                placeholder="Paste from Telegram Webhook Software Connection"
                style={
                  showTelegramSecret?.routerConnectionId
                    ? undefined
                    : getHiddenSecretInputStyle(config.routerConnectionId)
                }
              />
              <button className="btn btn-outline-secondary" type="button" onClick={() => handleTelegramRevealToggle("routerConnectionId")} aria-label="Show or hide router connection id">
                <i className={`fas fa-eye${showTelegramSecret?.routerConnectionId ? "-slash" : ""}`}></i>
              </button>
              <button className="btn btn-outline-primary rounded-end-3" type="button" onClick={() => copyTelegramFieldValue("routerConnectionId")}>
                <i className="fas fa-copy"></i>
              </button>
            </div>
          </div>
          <div className="col-12">
            <div className="d-flex justify-content-between align-items-center border rounded-3 px-3 py-2">
              <div>
                <div className="fw-bold">Enable Telegram notifications</div>
                <small className="text-muted">
                  Turn on to send payment verification requests to Telegram.
                </small>
              </div>
              <div className="form-check form-switch mb-0">
                <input className="form-check-input" type="checkbox" role="switch" checked={config.enabled === true} onChange={(e) => handleTelegramChange("enabled", e.target.checked)} disabled={!isSuperAdmin} id="telegram-enabled" />
              </div>
            </div>
          </div>

          <div className="col-12">
            <label className="form-label fw-bold">Webhook URL</label>
            <div className="input-group">
              <input className="form-control modern-input" value={webhookUrl || ""} readOnly />
              <button
                className="btn btn-outline-primary"
                type="button"
                onClick={() => navigator.clipboard?.writeText(webhookUrl || "")}
              >
                <i className="fas fa-copy"></i>
              </button>
            </div>
            <small className="text-muted">
              Paste this Target URL into the MaxCode Telegram Webhook Software Connection. If Shared Secret is saved, Telegram webhook stays on the router.
            </small>
          </div>

          <div className="col-12 d-flex flex-wrap gap-2">
            <button
              className="btn btn-primary fw-bold"
              type="button"
              disabled={!isSuperAdmin || isTelegramSettingUp}
              onClick={() => onTelegramSetup?.("set-webhook")}
            >
              <i className="fas fa-link me-1"></i>
              {isTelegramSettingUp ? "Working..." : "Set Webhook"}
            </button>
            <button
              className="btn btn-outline-secondary fw-bold"
              type="button"
              disabled={!isSuperAdmin || isTelegramSettingUp}
              onClick={() => onTelegramSetup?.("webhook-info")}
            >
              <i className="fas fa-circle-info me-1"></i>
              Webhook Info
            </button>
            <button
              className="btn btn-outline-success fw-bold"
              type="button"
              disabled={!isSuperAdmin || isTelegramSettingUp}
              onClick={() => onTelegramSetup?.("send-test")}
            >
              <i className="fas fa-paper-plane me-1"></i>
              Send Test
            </button>
            <button
              className="btn btn-outline-warning fw-bold"
              type="button"
              disabled={!isSuperAdmin || isTelegramSettingUp}
              onClick={() => onTelegramSetup?.("sync-commands")}
            >
              <i className="fas fa-list me-1"></i>
              Sync Command Menu
            </button>
          </div>
          <small className="text-muted">
            Sync Command Menu publishes the &quot;/&quot; list so typing <strong>/</strong> shows MaxCode Accounting and every feature. Run it once after changing the bot token.
          </small>
        </div>
      </div>
    </div>
  );
};

export default TelegramTab;
