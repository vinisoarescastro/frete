'use strict';
/* PDF do orçamento para o cliente (jsPDF, em /vendor/jspdf). Não inclui custos, margem nem lucro. */
import { brl, pctf } from './utils.js';

const INK = [17, 24, 39], MUTED = [75, 85, 99], LINE = [207, 213, 223], HEAD = [238, 241, 245], ACCENT = [232, 240, 255];

/** Monta o PDF a partir de quoteData() e devolve um Blob. */
export function buildPdf(d){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 18, CW = W - M * 2, LW = CW * 0.38;
  let y = M;
  const room = need => { if (y + need > H - M) { doc.addPage(); y = M; } };

  // Cabeçalho
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...INK);
  doc.text(d.provider || 'Serviços de Frete', M, y + 5);
  doc.setFontSize(14); doc.text('ORÇAMENTO DE FRETE', W - M, y + 5, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTED);
  if (d.providerPhone) doc.text(d.providerPhone, M, y + 11);
  doc.text('Data: ' + d.issue, W - M, y + 11, { align: 'right' });
  y += 15; doc.setDrawColor(...INK); doc.setLineWidth(0.6); doc.line(M, y, W - M, y); y += 8;

  // Tabela com título: linhas [rótulo, valor, estilo]
  const section = (title, rows, right) => {
    rows = rows.filter(r => r[1]);
    if (!rows.length) return;
    room(7 + 8);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.setFillColor(...HEAD);
    doc.rect(M, y, CW, 7, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...INK);
    doc.text(title.toUpperCase(), M + 3, y + 4.8); y += 7;
    rows.forEach(([k, v, style]) => {
      const lines = doc.splitTextToSize(String(v), CW - LW - 6);
      const h = Math.max(7, lines.length * 4.6 + 2.6);
      room(h);
      doc.setDrawColor(...LINE);
      if (style === 'total') { doc.setFillColor(...ACCENT); doc.rect(M, y, CW, h, 'FD'); } else doc.rect(M, y, CW, h);
      doc.line(M + LW, y, M + LW, y + h);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...(style ? INK : MUTED));
      doc.text(doc.splitTextToSize(k, LW - 6), M + 3, y + 4.8);
      doc.setFont('helvetica', style === 'total' ? 'bold' : 'normal'); doc.setFontSize(style === 'total' ? 11 : 9.5); doc.setTextColor(...INK);
      if (right) doc.text(lines, W - M - 3, y + 4.8, { align: 'right' }); else doc.text(lines, M + LW + 3, y + 4.8);
      y += h;
    });
    y += 6;
  };

  section('Cliente e serviço', [['Cliente', d.client], ['Telefone', d.phone], ['Tipo de serviço', d.service], ['Descrição', d.desc], ['Data prevista', d.date]]);
  section('Trajeto', [['Endereço de coleta', d.pickup], ['Endereço de entrega', d.delivery], ['Modalidade', d.mode], ['Quantidade de viagens', d.trips]]);

  const money = [];
  if (d.disc > 0) money.push(['Valor do serviço', brl(d.base)], ['Desconto (' + pctf(d.discPct) + ')', '-' + brl(d.disc)]);
  money.push(['Total à vista (Pix ou dinheiro)', d.price == null ? 'n/d' : brl(d.price), 'total']);
  if (d.card) money.push(['Total no cartão de crédito', brl(d.card)]);
  section('Valores', money, true);

  section('Observações', [['Observações', d.notes]]);

  if (d.validity) {
    room(8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED);
    doc.text(`Orçamento válido por ${d.validity} ${d.validity > 1 ? 'dias' : 'dia'} (até ${d.validUntil}).`, M, y + 3);
  }
  return doc.output('blob');
}
