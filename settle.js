/*
 * 割り勘の精算ロジック（DOM に依存しない純粋関数）
 *
 * 金額はすべて 1 円単位の整数で扱う。
 * 一人あたりの金額は「切り上げ」で算出し、多めに集まった端数は
 * 最も多く支払った人が受け取る。
 */
(function (root) {
  'use strict';

  /**
   * @param {number[]} paidList 参加者ごとの支払合計（整数・円）
   * @returns {{
   *   total: number,          // 旅費合計
   *   perPerson: number,      // 一人あたりの金額（切り上げ）
   *   surplus: number,        // 切り上げで多く集まる金額
   *   surplusReceiver: number|null, // 端数を受け取る参加者の index
   *   balances: number[],     // 各人の差額（支払額 − 一人あたり）。+ は受け取る側
   *   transfers: {from: number, to: number, amount: number}[]
   * }}
   */
  function settle(paidList) {
    const n = paidList.length;
    if (n === 0) throw new Error('参加者がいません');

    const total = paidList.reduce((sum, v) => sum + v, 0);
    const perPerson = Math.ceil(total / n);
    const surplus = perPerson * n - total;
    const balances = paidList.map((paid) => paid - perPerson);

    // 端数は最も多く支払った人（同額なら番号の若い人）が受け取る
    let surplusReceiver = null;
    if (surplus > 0) {
      surplusReceiver = 0;
      paidList.forEach((paid, i) => {
        if (paid > paidList[surplusReceiver]) surplusReceiver = i;
      });
    }

    const credits = []; // 受け取る側
    const debts = []; // 渡す側
    balances.forEach((b, i) => {
      const amount = i === surplusReceiver ? b + surplus : b;
      if (amount > 0) credits.push({ index: i, amount });
      else if (amount < 0) debts.push({ index: i, amount: -amount });
    });

    // 金額の大きい順に突き合わせる（受け渡しは最大でも n − 1 回）
    const byAmountDesc = (a, b) => b.amount - a.amount || a.index - b.index;
    credits.sort(byAmountDesc);
    debts.sort(byAmountDesc);

    const transfers = [];
    let c = 0;
    let d = 0;
    while (c < credits.length && d < debts.length) {
      const amount = Math.min(credits[c].amount, debts[d].amount);
      transfers.push({ from: debts[d].index, to: credits[c].index, amount });
      credits[c].amount -= amount;
      debts[d].amount -= amount;
      if (credits[c].amount === 0) c++;
      if (debts[d].amount === 0) d++;
    }

    return { total, perPerson, surplus, surplusReceiver, balances, transfers };
  }

  root.settle = settle;
  if (typeof module !== 'undefined' && module.exports) module.exports = { settle };
})(typeof window !== 'undefined' ? window : globalThis);
