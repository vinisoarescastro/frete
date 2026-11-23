'use strict';
/* Simulador público: cadastro do cliente, endereços com sugestões e valor estimado. */
const $ = s => document.querySelector(s);
const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
let token = '';
const picked = { pickup: null, delivery: null };

const show = (el, on) => { el.hidden = !on; };
const fail = (el, msg) => { el.textContent = msg || ''; show(el, !!msg); };

async function post(path, body){
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lead-Token': token }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Não foi possível concluir. Tente de novo.');
  return j;
}

// Máscara simples do telefone
$('#phone').addEventListener('input', e => {
  const d = e.target.value.replace(/\D/g, '').slice(0, 11);
  e.target.value = d.length > 6 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length > 10 ? 7 : 6)}-${d.slice(d.length > 10 ? 7 : 6)}` : d.length > 2 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : d;
});

// Etapa 1
$('#formStart').addEventListener('submit', async e => {
  e.preventDefault();
  fail($('#err1'), '');
  const btn = $('#btnStart'); btn.disabled = true;
  try {
    const r = await post('/api/public/start', { name: $('#name').value, phone: $('#phone').value, consent: $('#consent').checked, website: $('#website').value });
    token = r.token;
    show($('#step1'), false); show($('#step2'), true);
    $('#pickup').focus();
  } catch (x) { fail($('#err1'), x.message); }
  btn.disabled = false;
});

// Sugestões de endereço
function autocomplete(key){
  const input = $('#' + key), list = $('#' + key + '-list'), ok = $('#' + key + '-ok');
  let timer = 0, seq = 0, items = [], active = -1;
  const close = () => { show(list, false); input.setAttribute('aria-expanded', 'false'); active = -1; };
  const choose = it => { picked[key] = it; input.value = it.name; show(ok, true); close(); };
  const paint = () => {
    list.innerHTML = '';
    items.forEach((it, i) => {
      const li = document.createElement('li');
      li.className = 'ac-item'; li.role = 'option'; li.textContent = it.name;
      li.setAttribute('aria-selected', String(i === active));
      li.addEventListener('mousedown', ev => { ev.preventDefault(); choose(it); });
      list.appendChild(li);
    });
    show(list, items.length > 0); input.setAttribute('aria-expanded', String(items.length > 0));
  };
  input.addEventListener('input', () => {
    picked[key] = null; show(ok, false);
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) { items = []; close(); return; }
    timer = setTimeout(async () => {
      const my = ++seq;
      try {
        const r = await fetch('/api/public/suggest?q=' + encodeURIComponent(q), { headers: { 'X-Lead-Token': token } });
        if (!r.ok || my !== seq) return;
        items = (await r.json()).items || []; active = -1; paint();
      } catch { /* sem sugestões agora */ }
    }, 300);
  });
  input.addEventListener('keydown', e => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, items.length - 1); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); paint(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(items[active]); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
}
autocomplete('pickup'); autocomplete('delivery');

// Data: marcar "sem data" desativa o campo
$('#noDate').addEventListener('change', e => { $('#date').disabled = e.target.checked; if (e.target.checked) $('#date').value = ''; });
$('#date').min = new Date().toISOString().slice(0, 10);

// Etapa 2
$('#formSim').addEventListener('submit', async e => {
  e.preventDefault();
  fail($('#err2'), '');
  if (!picked.pickup || !picked.delivery) return fail($('#err2'), 'Escolha os endereços de coleta e entrega na lista de sugestões.');
  const noDate = $('#noDate').checked;
  if (!noDate && !$('#date').value) return fail($('#err2'), 'Informe a data desejada ou marque que ainda não tem uma data.');
  const btn = $('#btnSim'); btn.disabled = true; btn.textContent = 'Calculando...';
  try {
    const r = await post('/api/public/simulate', {
      pickup: picked.pickup, delivery: picked.delivery,
      mode: document.querySelector('input[name=mode]:checked').value, date: $('#date').value, noDate
    });
    $('#price').textContent = brl(r.price);
    const msg = `Olá! Fiz uma simulação de frete no site e gostaria de mais informações.\nColeta: ${picked.pickup.name}\nEntrega: ${picked.delivery.name}\nValor estimado: ${brl(r.price)}`;
    $('#btnWa').href = `https://wa.me/${r.phone ? '55' + r.phone.replace(/^55/, '') : ''}?text=${encodeURIComponent(msg)}`;
    show($('#step2'), false); show($('#step3'), true);
  } catch (x) { fail($('#err2'), x.message); }
  btn.disabled = false; btn.textContent = 'Calcular valor';
});

$('#btnAgain').addEventListener('click', () => {
  picked.pickup = picked.delivery = null;
  ['#pickup', '#delivery'].forEach(s => { $(s).value = ''; });
  show($('#pickup-ok'), false); show($('#delivery-ok'), false);
  show($('#step3'), false); show($('#step2'), true);
});
