/*
 * 旅行精算ツール
 * ハッシュルーティング（#/ 入力画面、#/result 結果画面）の SPA。
 * 入力内容は localStorage に保存し、サーバーには一切送信しない。
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'travel-settlement:v1';
  const DEFAULT_PARTICIPANTS = 2;
  const DEFAULT_ROWS = 3;
  const MIN_PARTICIPANTS = 2;
  const MAX_AMOUNT_DIGITS = 8; // 1 行あたり最大 99,999,999 円
  const MAX_NAME_LENGTH = 20;

  const ICONS = {
    trash:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>',
    plus:
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  };

  const view = document.getElementById('view');
  const dialog = document.getElementById('confirm-dialog');
  const toastEl = document.getElementById('toast');

  // ---------------------------------------------------------------------
  // 状態管理
  // ---------------------------------------------------------------------

  function emptyRow() {
    return { item: '', amount: '' };
  }

  function emptyParticipant() {
    return { name: '', open: true, rows: Array.from({ length: DEFAULT_ROWS }, emptyRow) };
  }

  function initialState() {
    return { participants: Array.from({ length: DEFAULT_PARTICIPANTS }, emptyParticipant) };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return initialState();
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.participants) || data.participants.length < MIN_PARTICIPANTS) {
        return initialState();
      }
      return {
        participants: data.participants.map((p) => ({
          name: String(p.name ?? '').slice(0, MAX_NAME_LENGTH),
          open: p.open !== false,
          rows:
            Array.isArray(p.rows) && p.rows.length > 0
              ? p.rows.map((r) => ({
                  item: String(r.item ?? ''),
                  amount: sanitizeAmount(String(r.amount ?? '')),
                }))
              : [emptyRow()],
        })),
      };
    } catch (e) {
      return initialState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // プライベートブラウズ等で保存できない場合も、画面上の操作は継続できるようにする
    }
  }

  let state = loadState();

  // ---------------------------------------------------------------------
  // ユーティリティ
  // ---------------------------------------------------------------------

  const yen = (n) => `${n.toLocaleString('ja-JP')}円`;
  /** 名前が未入力の場合は「参加者N」とする */
  const participantName = (i) => state.participants[i].name.trim() || `参加者${i + 1}`;
  const nameHtml = (i) => escapeHtml(participantName(i));

  /** 全角数字を半角にし、数字以外（カンマ等）を除去、先頭の 0 を詰める */
  function sanitizeAmount(value) {
    const digits = value
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/\D/g, '')
      .replace(/^0+(?=\d)/, '');
    return digits.slice(0, MAX_AMOUNT_DIGITS);
  }

  function paidTotal(participant) {
    return participant.rows.reduce((sum, r) => sum + (r.amount === '' ? 0 : Number(r.amount)), 0);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  let toastTimer = null;
  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2200);
  }

  /** 確認モーダルを開き、OK が押されたら true を返す */
  function confirmDialog({ title, message, okLabel }) {
    dialog.querySelector('#confirm-title').textContent = title;
    dialog.querySelector('#confirm-message').textContent = message;
    dialog.querySelector('#confirm-ok').textContent = okLabel;
    dialog.returnValue = '';
    return new Promise((resolve) => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
      dialog.showModal();
    });
  }

  // ---------------------------------------------------------------------
  // 入力画面
  // ---------------------------------------------------------------------

  function renderRow(pIndex, rIndex, row) {
    return `
      <div class="row" data-p="${pIndex}" data-r="${rIndex}">
        <input class="input" type="text" name="item" enterkeyhint="next" autocomplete="off"
          placeholder="${rIndex === 0 ? '例：交通費' : ''}" aria-label="${nameHtml(pIndex)}の買ったもの ${rIndex + 1}行目"
          value="${escapeHtml(row.item)}">
        <div class="amount-wrap">
          <input class="input input-amount" type="text" name="amount" inputmode="numeric" pattern="[0-9]*"
            enterkeyhint="next" autocomplete="off" placeholder="0"
            aria-label="${nameHtml(pIndex)}の金額 ${rIndex + 1}行目" value="${row.amount}">
        </div>
        <button type="button" class="icon-btn" data-action="delete-row"
          aria-label="${nameHtml(pIndex)}の${rIndex + 1}行目を削除">${ICONS.trash}</button>
      </div>`;
  }

  function renderParticipant(p, pIndex) {
    const canDelete = state.participants.length > MIN_PARTICIPANTS;
    return `
      <details class="participant" data-p="${pIndex}" ${p.open ? 'open' : ''}>
        <summary>
          <span class="participant-name" data-name="${pIndex}">${nameHtml(pIndex)}</span>
          <span class="participant-subtotal" data-subtotal="${pIndex}">${yen(paidTotal(p))}</span>
        </summary>
        <div class="participant-body">
          <label class="name-field">
            <span class="field-label">名前</span>
            <input class="input" type="text" name="name" enterkeyhint="next" autocomplete="off"
              maxlength="${MAX_NAME_LENGTH}" placeholder="参加者${pIndex + 1}" value="${escapeHtml(p.name)}">
          </label>
          <div class="row-head" aria-hidden="true"><span>買ったもの</span><span>金額</span><span></span></div>
          ${p.rows.map((row, rIndex) => renderRow(pIndex, rIndex, row)).join('')}
          <div class="participant-actions">
            <button type="button" class="btn btn-ghost" data-action="add-row" data-p="${pIndex}">
              ${ICONS.plus}行を追加
            </button>
            ${
              canDelete
                ? `<button type="button" class="btn btn-text" data-action="delete-participant" data-p="${pIndex}">この参加者を削除</button>`
                : ''
            }
          </div>
        </div>
      </details>`;
  }

  function grandTotal() {
    return state.participants.reduce((sum, p) => sum + paidTotal(p), 0);
  }

  function renderInput(focus) {
    document.title = '旅行精算ツール';
    view.innerHTML = `
      <p class="lead">旅行中に立て替えた費用を、参加者ごとに入力してください。入力内容はこの端末のブラウザに自動保存されます。</p>
      <div class="participants">
        ${state.participants.map(renderParticipant).join('')}
      </div>
      <div class="toolbar">
        <button type="button" class="btn btn-secondary" data-action="add-participant">${ICONS.plus}参加人数を追加</button>
        <button type="button" class="btn btn-text" data-action="reset">入力をリセットする</button>
      </div>
      <div class="sticky-footer">
        <div class="sticky-footer-inner">
          <div class="sticky-footer-total">合計（${state.participants.length}人）<strong data-grand-total>${yen(grandTotal())}</strong></div>
          <button type="button" class="btn btn-primary" data-action="calculate">精算する</button>
        </div>
      </div>
      <p class="error-text" data-error hidden></p>`;

    if (focus) {
      const el = view.querySelector(focus);
      if (el) {
        el.focus();
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }

  function updateTotals(pIndex) {
    const sub = view.querySelector(`[data-subtotal="${pIndex}"]`);
    if (sub) sub.textContent = yen(paidTotal(state.participants[pIndex]));
    const total = view.querySelector('[data-grand-total]');
    if (total) total.textContent = yen(grandTotal());
  }

  function handleInputEvent(e) {
    const input = e.target;

    if (input.name === 'name') {
      const pIndex = Number(input.closest('.participant').dataset.p);
      state.participants[pIndex].name = input.value;
      const label = view.querySelector(`[data-name="${pIndex}"]`);
      if (label) label.textContent = participantName(pIndex);
      saveState();
      return;
    }

    const rowEl = input.closest('.row');
    if (!rowEl) return;
    const pIndex = Number(rowEl.dataset.p);
    const rIndex = Number(rowEl.dataset.r);
    const row = state.participants[pIndex].rows[rIndex];

    if (input.name === 'item') {
      row.item = input.value;
    } else if (input.name === 'amount') {
      // IME 変換中は値を書き換えない（全角数字は確定時に半角化する）
      if (e.isComposing) return;
      const clean = sanitizeAmount(input.value);
      if (clean !== input.value) input.value = clean;
      row.amount = clean;
      updateTotals(pIndex);
      const err = view.querySelector('[data-error]');
      if (err) err.hidden = true;
    }
    saveState();
  }

  async function handleClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'add-row') {
      const pIndex = Number(btn.dataset.p);
      const rows = state.participants[pIndex].rows;
      rows.push(emptyRow());
      saveState();
      renderInput(`.row[data-p="${pIndex}"][data-r="${rows.length - 1}"] input[name="item"]`);
    } else if (action === 'delete-row') {
      const rowEl = btn.closest('.row');
      const pIndex = Number(rowEl.dataset.p);
      const rIndex = Number(rowEl.dataset.r);
      const rows = state.participants[pIndex].rows;
      // 最後の 1 行は削除せず空にする
      if (rows.length > 1) rows.splice(rIndex, 1);
      else rows[0] = emptyRow();
      saveState();
      renderInput();
    } else if (action === 'add-participant') {
      state.participants.push(emptyParticipant());
      saveState();
      const pIndex = state.participants.length - 1;
      renderInput(`.row[data-p="${pIndex}"][data-r="0"] input[name="item"]`);
    } else if (action === 'delete-participant') {
      const pIndex = Number(btn.dataset.p);
      const ok = await confirmDialog({
        title: `${participantName(pIndex)}を削除しますか？`,
        message: `${participantName(pIndex)}の入力内容（${yen(paidTotal(state.participants[pIndex]))}）がすべて削除されます。\n名前が未入力の参加者は、番号が繰り上がります。`,
        okLabel: '削除する',
      });
      if (!ok) return;
      state.participants.splice(pIndex, 1);
      saveState();
      renderInput();
    } else if (action === 'reset') {
      const ok = await confirmDialog({
        title: '入力をリセットしますか？',
        message: '入力した内容、追加した行・参加者がすべて削除され、最初の状態に戻ります。この操作は元に戻せません。',
        okLabel: '削除する',
      });
      if (!ok) return;
      state = initialState();
      saveState();
      renderInput();
      window.scrollTo({ top: 0 });
      showToast('入力をリセットしました');
    } else if (action === 'calculate') {
      if (grandTotal() === 0) {
        const err = view.querySelector('[data-error]');
        err.hidden = false;
        err.textContent = '金額が入力されていません。';
        showToast('金額を入力してください');
        return;
      }
      location.hash = '#/result';
    } else if (action === 'back') {
      location.hash = '#/';
    } else if (action === 'copy') {
      copyResult();
    }
  }

  function handleToggle(e) {
    const details = e.target;
    if (!details.matches || !details.matches('details.participant')) return;
    const p = state.participants[Number(details.dataset.p)];
    if (p && p.open !== details.open) {
      p.open = details.open;
      saveState();
    }
  }

  // ---------------------------------------------------------------------
  // 結果画面
  // ---------------------------------------------------------------------

  function computeResult() {
    const paidList = state.participants.map(paidTotal);
    return { paidList, ...window.settle(paidList) };
  }

  function renderResult() {
    document.title = '精算結果｜旅行精算ツール';
    const r = computeResult();

    if (r.total === 0) {
      view.innerHTML = `
        <section class="result-section">
          <h2 class="section-title">金額が入力されていません</h2>
          <p class="note">入力画面で、立て替えた費用を入力してください。</p>
        </section>
        <div class="result-actions">
          <button type="button" class="btn btn-secondary btn-block" data-action="back">戻る</button>
        </div>`;
      return;
    }

    const n = r.paidList.length;
    const transfersHtml = r.transfers.length
      ? r.transfers
          .map(
            (t) => `
          <li>
            <span class="transfer-names">${nameHtml(t.from)} → ${nameHtml(t.to)}</span>
            <span class="transfer-amount">${yen(t.amount)}</span>
          </li>`,
          )
          .join('')
      : '<li>全員の支払額が同じため、精算は不要です。</li>';

    const surplusNote =
      r.surplus > 0
        ? `<p class="note">※ ${yen(r.total)} ÷ ${n}人 は割り切れないため、一人あたりの金額を1円単位で切り上げています。多く集まる${yen(r.surplus)}は、最も多く支払った${nameHtml(r.surplusReceiver)}が受け取ります。</p>`
        : '';

    view.innerHTML = `
      <section class="result-section" aria-labelledby="h-summary">
        <h2 class="section-title" id="h-summary">精算の概要</h2>
        <dl class="summary-grid">
          <div><dt>旅費の合計</dt><dd>${yen(r.total)}</dd></div>
          <div><dt>一人あたり（${n}人）</dt><dd>${yen(r.perPerson)}</dd></div>
        </dl>
        ${surplusNote}
      </section>

      <section class="result-section" aria-labelledby="h-transfers">
        <h2 class="section-title" id="h-transfers">誰が誰にいくら渡すか</h2>
        <ul class="transfer-list">${transfersHtml}</ul>
      </section>

      <section class="result-section" aria-labelledby="h-paid">
        <h2 class="section-title" id="h-paid">各人の支払済み金額</h2>
        <ul class="paid-list">
          ${r.paidList
            .map((paid, i) => {
              const diff = r.balances[i];
              const diffText =
                diff > 0 ? `${yen(diff)} 多く支払い` : diff < 0 ? `${yen(-diff)} 不足` : '過不足なし';
              return `
              <li>
                <span>${nameHtml(i)}</span>
                <span><span class="paid-amount">${yen(paid)}</span><span class="paid-diff">${diffText}</span></span>
              </li>`;
            })
            .join('')}
        </ul>
      </section>

      <div class="result-actions">
        <button type="button" class="btn btn-primary btn-block" data-action="copy">結果をコピーする</button>
        <button type="button" class="btn btn-secondary btn-block" data-action="back">戻る</button>
      </div>`;
    window.scrollTo({ top: 0 });
  }

  /** LINE 等に貼り付ける用のテキスト */
  function buildShareText() {
    const r = computeResult();
    const n = r.paidList.length;
    const lines = [
      '【旅行精算】',
      `合計：${yen(r.total)}`,
      `一人あたり：${yen(r.perPerson)}（${n}人）`,
      '',
      '■ 精算',
      ...(r.transfers.length
        ? r.transfers.map((t) => `${participantName(t.from)} → ${participantName(t.to)}：${yen(t.amount)}`)
        : ['精算は不要です']),
      '',
      '■ 支払済み',
      ...r.paidList.map((paid, i) => `${participantName(i)}：${yen(paid)}`),
    ];
    if (r.surplus > 0) {
      lines.push('', `※ 端数切り上げにより${yen(r.surplus)}多く集まり、${participantName(r.surplusReceiver)}が受け取ります`);
    }
    return lines.join('\n');
  }

  async function copyResult() {
    const text = buildShareText();
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      // Clipboard API が使えない環境（http 接続等）向けのフォールバック
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (!ok) {
        showToast('コピーできませんでした');
        return;
      }
    }
    showToast('結果をコピーしました');
  }

  // ---------------------------------------------------------------------
  // ルーター
  // ---------------------------------------------------------------------

  function route() {
    if (location.hash === '#/result') renderResult();
    else renderInput();
  }

  view.addEventListener('input', handleInputEvent);
  view.addEventListener('compositionend', handleInputEvent);
  view.addEventListener('click', handleClick);
  view.addEventListener('toggle', handleToggle, true);
  window.addEventListener('hashchange', route);
  // 別タブでの変更を反映する
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      state = loadState();
      route();
    }
  });

  route();
})();
