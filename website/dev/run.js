// Test sonuçlarını tabloya döker (CSP satır içi betiğe izin vermediği için ayrı dosya).
import { runAll } from './tests.js';

const res = await runAll();
window.__testResults = res;
const pass = res.filter((r) => r.ok).length;
const sum = document.getElementById('sum');
sum.textContent = `${pass} / ${res.length} test geçti (%${((100 * pass) / res.length).toFixed(1)})`;
sum.className = 'sum ' + (pass === res.length ? 'ok' : 'bad');
const render = () => {
  const only = document.getElementById('onlyFail').checked;
  const tb = document.getElementById('rows');
  tb.replaceChildren(...res.filter((r) => !only || !r.ok).map((r) => {
    const tr = document.createElement('tr');
    if (!r.ok) tr.className = 'fail';
    for (const v of [r.kind, r.input, r.expected, r.got, r.ok ? '✓' : '✗']) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    }
    return tr;
  }));
};
document.getElementById('onlyFail').addEventListener('change', render);
render();
