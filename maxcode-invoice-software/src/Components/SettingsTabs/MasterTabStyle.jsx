import React from "react";

/**
 * Shared shell styling for the Settings master tabs (HSN Code, Payment Methods
 * Charge, Interested Services) so all three share one identical header,
 * search bar and table treatment. Keep the class names in sync with
 * InterestedServiceTab, which is the reference design.
 */
const MasterTabStyle = () => (
  <style>{`
    .is2-shell {
      border-radius: 24px;
      border: 1px solid #dcf2e5;
      background: linear-gradient(180deg, #fbfefc 0%, #ffffff 26%);
      box-shadow: 0 18px 36px rgba(25, 135, 84, 0.08);
      overflow: hidden;
    }

    .is2-topband {
      padding: 1.1rem 1.2rem;
      background: linear-gradient(135deg, #198754 0%, #146c43 100%);
      position: relative;
      isolation: isolate;
    }

    .is2-topband::after {
      content: "";
      position: absolute;
      inset: auto -45px -45px auto;
      width: 170px;
      height: 170px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.08);
      z-index: -1;
    }

    .is2-title-wrap {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .is2-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.2);
      color: #fff;
      font-size: 1.05rem;
    }

    .is2-title {
      color: #fff;
      margin: 0;
      font-size: 1.08rem;
      font-weight: 800;
      letter-spacing: 0.2px;
    }

    .is2-subtitle {
      margin: 0.1rem 0 0;
      color: rgba(255, 255, 255, 0.88);
      font-size: 0.74rem;
      text-transform: uppercase;
      letter-spacing: 0.7px;
    }

    .is2-pills {
      display: flex;
      gap: 0.45rem;
      flex-wrap: wrap;
    }

    .is2-pill {
      background: #fff;
      border: 1px solid #d7efe1;
      color: #146c43;
      border-radius: 999px;
      padding: 0.35rem 0.75rem;
      font-weight: 700;
      font-size: 0.74rem;
    }

    .is2-pill-btn {
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
    }

    .is2-pill-btn:hover {
      background: #198754;
      color: #fff;
      border-color: #198754;
    }

    .is2-pill-warn {
      background: #fff4e5;
      border-color: #ffd8a8;
      color: #b45309;
    }

    /* Version picker inside the history modal */
    .pm-version-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .pm-version-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      width: 100%;
      text-align: left;
      padding: 0.7rem 0.9rem;
      border: 1px solid #e3efe8;
      border-radius: 12px;
      background: #fbfefc;
      cursor: pointer;
      transition: border-color 0.15s ease, background 0.15s ease;
    }

    .pm-version-item:hover {
      border-color: #198754;
      background: #f2fbf6;
    }

    .pm-version-item.is-selected {
      border-color: #198754;
      background: #eaf7f0;
    }

    .pm-version-main {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .pm-version-tag {
      font-weight: 800;
      color: #1f3a2b;
      font-size: 0.9rem;
    }

    .pm-version-meta {
      font-size: 0.75rem;
      color: #7d938a;
      white-space: nowrap;
    }

    .is2-controls {
      padding: 1rem 1.2rem;
      border-bottom: 1px solid #eaf6ef;
      background: #ffffff;
    }

    .is2-search {
      position: relative;
    }

    .is2-search i {
      position: absolute;
      top: 50%;
      left: 13px;
      transform: translateY(-50%);
      color: #198754;
      font-size: 0.9rem;
      pointer-events: none;
    }

    .is2-search input {
      width: 100%;
      border-radius: 12px;
      border: 2px solid #027231;
      background: #f9fdfa;
      padding: 0.64rem 0.8rem 0.64rem 2.15rem;
      font-size: 0.93rem;
      color: #1f3a2b;
      transition: all 0.2s ease;
    }

    .is2-search input:focus {
      outline: none;
      border-color: #fa0000;
      background: #ffffff;
    }

    .is2-btn {
      border-radius: 10px;
      font-weight: 700;
      white-space: nowrap;
    }

    .is2-add-btn {
      box-shadow: 0 10px 18px rgba(25, 135, 84, 0.22);
    }

    .is2-table .premium-table thead {
      background: linear-gradient(135deg, #007026 0, #09a98d 100%);
      border-bottom: 1px solid #e1f1e7;
      color: #fff;
      font-weight: 700;
    }

    .is2-table .premium-table tbody tr {
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    .is2-table .premium-table tbody tr:hover {
      background-color: #f1f5f9;
      box-shadow: inset 0 0 0 1px #edf8f1;
    }

    .is2-empty {
      margin: 1rem 0 0.5rem;
      border: 1px dashed #cae8d7;
      border-radius: 14px;
      background: #fbfefc;
      padding: 2rem 1rem;
      text-align: center;
    }

    .is2-empty i {
      font-size: 1.9rem;
      color: #8abf9f;
      margin-bottom: 0.5rem;
    }

    .is2-empty h3 {
      font-size: 1rem;
      margin-bottom: 0.3rem;
      color: #1f4632;
    }

    .is2-empty p {
      margin: 0;
      color: #6a8f79;
      font-size: 0.88rem;
    }

    .is2-modal-head {
      background: linear-gradient(135deg, #198754 0%, #146c43 100%);
      color: #fff;
      border-top-left-radius: 1rem;
      border-top-right-radius: 1rem;
      border-bottom: none;
    }

    .is2-modal-head .btn-close {
      filter: invert(1);
      opacity: 0.95;
    }

    .is2-modal-footer {
      border-top: 1px solid #edf7f1;
    }

    /* Fee block (Processing Fee / MDR) inside the payment method form */
    .pm-fee-card {
      border: 1px solid #e3efe8;
      border-radius: 12px;
      padding: 0.6rem 0.75rem;
      margin-bottom: 0.75rem;
      background: #fcfefd;
      transition: border-color 0.2s ease, background 0.2s ease;
    }

    .pm-fee-card.is-on {
      border-color: #cbe8d8;
      background: #f6fcf8;
    }

    .pm-fee-card.is-off {
      border-color: #e7ebe9;
      background: #fafbfa;
    }

    .pm-fee-head {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      margin-bottom: 0.5rem;
    }

    .pm-fee-icon {
      width: 26px;
      height: 26px;
      flex: 0 0 26px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #e7f5ed;
      color: #198754;
      font-size: 0.7rem;
    }

    .pm-fee-card.is-off .pm-fee-icon {
      background: #eef1ef;
      color: #8a9a92;
    }

    .pm-fee-title {
      font-weight: 700;
      color: #1f3a2b;
      font-size: 0.85rem;
      flex-grow: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .pm-fee-switch {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      white-space: nowrap;
    }

    .pm-fee-switch .form-check-input {
      width: 2.1em;
      height: 1.1em;
      margin-top: 0;
      cursor: pointer;
    }

    .pm-fee-state {
      font-size: 0.72rem;
      font-weight: 700;
      color: #198754;
      min-width: 46px;
      cursor: pointer;
    }

    .pm-fee-card.is-off .pm-fee-state {
      color: #8a9a92;
    }

    /* The inputs keep the standard .modern-input look (48px, 2px grey border)
       so they match every other field in the app. Bootstrap's coloured focus
       ring is suppressed inside these cards. */
    .pm-fee-card .form-control {
      height: 48px;
      font-size: 0.875rem;
      border: 2px solid #e9ecef;
      box-shadow: none !important;
    }

    .pm-fee-card .form-control:focus,
    .pm-fee-card .form-control:focus-visible {
      border-color: #007026 !important;
      box-shadow: none !important;
      outline: none !important;
    }

    .pm-fee-card .input-group-text {
      height: 48px;
      background: #f8f9fa;
      border: 2px solid #e9ecef;
      border-left: none;
      color: #5b7a68;
      font-weight: 600;
      font-size: 0.875rem;
      line-height: 1;
    }

    .pm-fee-card .input-group > .input-group-text:first-child {
      border: 2px solid #e9ecef;
      border-right: none;
      border-radius: 10px 0 0 10px;
    }

    .pm-fee-card .input-group > .form-control {
      border: 2px solid #e9ecef;
      border-radius: 10px 0 0 10px;
    }

    .pm-fee-card .input-group > .input-group-text:first-child + .form-control {
      border-radius: 0 10px 10px 0;
    }

    .pm-fee-card .input-group > .input-group-text:last-child {
      border-radius: 0 10px 10px 0;
    }

    .pm-fee-card .form-control:disabled {
      background: #f4f6f5;
    }

    @media (max-width: 991.98px) {
      .is2-pills {
        margin-top: 0.35rem;
      }
    }

    @media (max-width: 767.98px) {
      .is2-topband,
      .is2-controls,
      .is2-table {
        padding-left: 0.85rem;
        padding-right: 0.85rem;
      }

      .is2-title {
        font-size: 1rem;
      }
    }
  `}</style>
);

export default MasterTabStyle;
