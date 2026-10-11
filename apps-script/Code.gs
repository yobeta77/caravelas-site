/**
 * CrossFit Caravelas — script da Google Sheet do site (owner: Juanpi).
 *
 * Menu "Site" na folha:
 *   - Publicar alterações  -> verifica a folha e chama POST /api/revalidate (o site atualiza já)
 *   - Verificar folha      -> lista as linhas com problemas (as que o site vai ignorar)
 *   - Ver avisos do site   -> link para /status (avisos do parser do site)
 *   - Admin ▸ Configurar folha      -> caixas de seleção, listas, formatos, células vermelhas,
 *                                      cabeçalhos protegidos, linhas de exemplo, LEIA-ME
 *                                      + aspeto de tabela e o separador oculto 'listas'
 *                                      (horas possíveis e coaches para os menus de horario)
 *   - Admin ▸ Configurar publicação -> URL do site + REVALIDATE_SECRET (guardados nas
 *                                      propriedades do script, nunca no código: o repo é público)
 *
 * "Configurar folha" pode correr várias vezes (idempotente). Corra-a com a conta dona da folha,
 * senão a proteção dos cabeçalhos fica só como aviso.
 *
 * As regras abaixo espelham src/content/parse/{values,tabs}.ts. Se o parser mudar, mude aqui.
 * Docs: docs/SHEET.md.
 */

const TAG = '[site]';
const PREPARED_ROWS = 200; // linhas preparadas (caixas/listas) abaixo do cabeçalho
const README_TAB = 'LEIA-ME';
const LISTS_TAB = 'listas';
const LIST_ROWS = 300; // linhas usadas em 'listas'

// ---------- regras ----------
// Os padrões são usados tanto em JS (verificar) como em REGEXMATCH (validação da folha, RE2):
// nada de flags inline nem aspas.

const RX = {
  time: '^\\s*\\d{1,2}\\s*([:hH.,]\\s*(\\d{2})?)?\\s*(:\\d{2})?\\s*([aApP]\\.?\\s*[mM]\\.?)?\\s*$',
  price: '^\\s*(€|[eE][uU][rR][oO]?[sS]?)?\\s*\\d[\\d.,]*\\s*(€|[eE][uU][rR][oO]?[sS]?)?\\s*$',
  int: '^\\s*\\d+\\s*$',
  date: '^\\s*(\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[/.-]\\d{1,2}[/.-](\\d{2}|\\d{4}))\\s*$',
  url: '^\\s*(https?://)?[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+(/\\S*)?\\s*$',
  instagram: '^\\s*(@?[A-Za-z0-9._]{1,30}|(https?://)?[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+(/\\S*)?)\\s*$',
  // config: horário "07:00-21:00", "7h às 21h"; vazio/Fechado = fechado (a ordem abre < fecha só o menu Verificar confirma)
  hours: '^\\s*([fF]echado|[eE]ncerrado|[cC]losed|[-–—])?\\s*$|^\\s*\\d{1,2}\\s*([:hH.,]\\s*(\\d{2})?)?\\s*(-|–|—|[aAàÀ][sS]?|[tT][oO])\\s*\\d{1,2}\\s*([:hH.,]\\s*(\\d{2})?)?\\s*$',
  phone: '^\\s*[+(]?[\\d\\s().+-]{8,24}\\s*$',
  emails: '^\\s*[^\\s@,;]+@[^\\s@,;]+\\.[^\\s@,;]+([\\s,;]+[^\\s@,;]+@[^\\s@,;]+\\.[^\\s@,;]+)*[\\s,;]*$',
};

const LISTS = {
  dia: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'],
  tipo: ['CrossFit', 'Open Box', 'Team WOD', 'Outro'],
  icone: ['Boia', 'Âncora', 'Navio'],
  foto_lado: ['esquerda', 'direita'],
};

const check = (defaultOn) => ({ type: 'check', defaultOn });
const list = (name, required) => ({ type: 'list', values: LISTS[name], required: !!required });
const rx = (pattern, help, required, format) => ({ type: 'regex', pattern, help, required: !!required, format });
const text = () => ({ type: 'text', required: true });
/** Menu alimentado por uma coluna do separador 'listas' (ver setupListas). */
const fromList = (source, required, pattern, help) => ({ type: 'range', source, required: !!required, pattern, help, format: '@' });

const HELP = {
  time: 'Hora: 07:00, 7h, 7h30 ou 19:30',
  price: 'Preço em euros: 60, 60,00 ou €60',
  int: 'Número inteiro (vazio = ordem da folha)',
  date: 'Data: dd/mm/aaaa',
  url: 'Link, ex.: https://exemplo.pt/pagina',
  instagram: '@utilizador ou link do perfil',
  hours: 'Horário: 07:00-21:00 ou 7h às 21h (vazio = fechado)',
  phone: 'Telefone: +351 912 345 678',
  emails: 'Emails separados por vírgula: a@caravelas.fit, b@caravelas.fit',
};

/** Colunas com regras, por separador. Colunas que não estão aqui ficam livres. */
const TABS = {
  marquesina: {
    cols: {
      ativo: check(true),
      destaque_pt: text(),
      link: rx(RX.url, HELP.url),
      inicio: rx(RX.date, HELP.date, false, 'dd/mm/yyyy'),
      fim: rx(RX.date, HELP.date, false, 'dd/mm/yyyy'),
      ordem: rx(RX.int, HELP.int, false, '@'),
    },
    example: { destaque_pt: 'Exemplo: Open Day', texto_pt: 'traga um amigo' },
  },
  horario: {
    cols: {
      ativo: check(true),
      dia: list('dia', true),
      hora: fromList('horas', true, RX.time, HELP.time),
      tipo: list('tipo', true),
      coach: fromList('coaches'),
    },
    example: { dia: 'Segunda', hora: '07:00', tipo: 'CrossFit', nota_pt: 'Nota opcional' },
  },
  precos: {
    cols: {
      ativo: check(true),
      plano_pt: text(),
      preco: rx(RX.price, HELP.price, true, '@'),
      destaque: check(false),
      ordem: rx(RX.int, HELP.int, false, '@'),
    },
    example: { plano_pt: 'Exemplo: 1 aula por semana', preco: '40' },
  },
  equipa: {
    cols: {
      ativo: check(true),
      nome: text(),
      bio_pt: text(),
      instagram: rx(RX.instagram, HELP.instagram),
      foto_lado: list('foto_lado'),
      ordem: rx(RX.int, HELP.int, false, '@'),
    },
    example: { nome: 'Nome Apelido', bio_pt: 'Texto da bio (pode ter vários parágrafos).', instagram: '@exemplo', foto_lado: 'esquerda' },
  },
  destaques: {
    cols: {
      ativo: check(true),
      icone: list('icone', true),
      titulo_pt: text(),
      texto_pt: text(),
      ordem: rx(RX.int, HELP.int, false, '@'),
    },
    example: { icone: 'Boia', titulo_pt: 'Título do destaque', texto_pt: 'Texto curto (2–3 linhas).' },
  },
};

// Chaves obrigatórias do separador config. As três horario_* têm de existir, mas vazio = fechado.
const CONFIG_REQUIRED = ['hero_titulo', 'cta_texto', 'cta_badge', 'cta_link', 'morada_rua', 'morada_cp', 'morada_cidade', 'maps_link'];
const CONFIG_MUST_EXIST = ['horario_seg_sex', 'horario_sab', 'horario_dom'];
// Chaves de config que são links (o site ignora um link inválido; cta_link e maps_link são obrigatórios).
const CONFIG_LINKS = ['cta_link', 'maps_link', 'precos_promo_link', 'politica_privacidade_link', 'politica_cookies_link', 'crossfit_afiliado_link', 'facebook'];

/** Regra (padrão + ajuda) do valor de uma chave de config, ou null se o texto é livre. */
function configRule(key) {
  if (CONFIG_MUST_EXIST.indexOf(key) >= 0) return { pattern: RX.hours, help: HELP.hours };
  if (CONFIG_LINKS.indexOf(key) >= 0) return { pattern: RX.url, help: HELP.url };
  if (key === 'whatsapp') return { pattern: RX.phone, help: HELP.phone };
  if (key === 'email') return { pattern: RX.emails, help: HELP.emails };
  if (key === 'instagram') return { pattern: RX.instagram, help: HELP.instagram };
  return null;
}

// ---------- utilitários puros ----------

function fold(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}
/** Igual ao parser: ignora maiúsculas, acentos, espaços e hífenes. */
function normHeader(h) {
  return fold(h).replace(/[\s-]+/g, '_');
}
function isBlank(v) {
  return String(v == null ? '' : v).trim() === '';
}
const TRUE_WORDS = ['true', 'verdadeiro', 'sim', 's', 'yes', 'y', 'si', '1', 'x', '✓', '✔', '☑'];
const FALSE_WORDS = ['false', 'falso', 'nao', 'n', 'no', '0', '✗', '☐'];
function toBool(v, ifBlank) {
  if (v === true || v === false) return v;
  if (isBlank(v)) return ifBlank;
  const f = fold(v);
  if (TRUE_WORDS.indexOf(f) >= 0) return true;
  if (FALSE_WORDS.indexOf(f) >= 0) return false;
  return null;
}
/** Valor existente -> item canónico da lista ("terca", "TER", "Tuesday" -> "Terça"), ou null. */
function canonical(listValues, v) {
  const f = fold(v).replace(/[\s_-]+/g, '');
  if (!f) return null;
  const en = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
  for (let i = 0; i < listValues.length; i++) {
    const c = fold(listValues[i]).replace(/[\s_-]+/g, '');
    if (c === f) return listValues[i];
    if (listValues === LISTS.dia && (f.slice(0, 3) === c.slice(0, 3) || en[f.slice(0, 3)] === i)) return listValues[i];
  }
  const aliases = { lifebuoy: 'Boia', anchor: 'Âncora', ship: 'Navio', barco: 'Navio', cf: 'CrossFit', other: 'Outro', outra: 'Outro', left: 'esquerda', right: 'direita' };
  return aliases[f] && listValues.indexOf(aliases[f]) >= 0 ? aliases[f] : null;
}
/** Igual a parseTime do site: "7h30", "7.30", "07:00:00", "7 PM" -> "HH:MM"; senão null. */
function normTime(s) {
  const v = fold(s).replace(/\s+/g, '');
  const m = /^(\d{1,2})(?:[:h.,](\d{2})?)?(?::\d{2})?(am|pm|a\.m\.|p\.m\.)?$/.exec(v);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  const ap = m[3] ? m[3][0] : '';
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === 'a' && h === 12) h = 0;
    if (ap === 'p' && h !== 12) h += 12;
  }
  if (h > 23 || min > 59) return null;
  return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
}
/** 05:00, 05:15 … 22:30. */
function defaultHours() {
  const out = [];
  for (let m = 5 * 60; m <= 22 * 60 + 30; m += 15) out.push(String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
  return out;
}

/** Igual a parseTimeRange do site: "7h às 21h" -> "07:00-21:00"; vazio/Fechado -> 'closed'; senão null. */
function hoursRange(s) {
  const v = fold(s).replace(/\s+/g, ' ');
  if (v === '' || ['fechado', 'encerrado', 'closed', '-', '–', '—'].indexOf(v) >= 0) return 'closed';
  const parts = v.split(/\s*(?:-|–|—|\bas\b|\ba\b|\bto\b)\s*/).filter(Boolean);
  if (parts.length !== 2) return null;
  const o = normTime(parts[0]);
  const c = normTime(parts[1]);
  return o && c && c > o ? `${o}-${c}` : null;
}
/** Igual a parsePhone do site: "+351 912 849 143", "912 849 143" -> "+351912849143"; senão null. */
function phoneE164(s) {
  let v = String(s == null ? '' : s).trim().replace(/[\s().-]/g, '');
  if (v.slice(0, 2) === '00') v = '+' + v.slice(2);
  if (/^[29]\d{8}$/.test(v)) v = '+351' + v;
  return /^\+\d{8,15}$/.test(v) ? v : null;
}
/** Emails inválidos numa lista separada por vírgulas/ponto e vírgula (como parseEmails do site). */
function badEmails(s) {
  return String(s == null ? '' : s)
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}
/** Problema do valor de uma chave de config (texto como aparece), ou null. */
function configValueProblem(key, display) {
  if (isBlank(display)) return null;
  const v = String(display).trim();
  if (CONFIG_MUST_EXIST.indexOf(key) >= 0) return hoursRange(v) ? null : `horário inválido '${v}' — ${HELP.hours}`;
  if (CONFIG_LINKS.indexOf(key) >= 0) return new RegExp(RX.url).test(v) ? null : `link inválido '${v}' — ${HELP.url}`;
  if (key === 'whatsapp') return phoneE164(v) ? null : `número inválido '${v}' — ${HELP.phone}`;
  if (key === 'email') {
    const bad = badEmails(v);
    return bad.length ? `email inválido ${bad.map((e) => `'${e}'`).join(', ')} — ${HELP.emails}` : null;
  }
  if (key === 'instagram') return new RegExp(RX.instagram).test(v) ? null : `instagram inválido '${v}' — ${HELP.instagram}`;
  return null;
}

/** Problemas de uma célula (texto como aparece na folha). Vazio = sem problema, salvo se obrigatória. */
function cellProblem(spec, display, colName) {
  if (!spec || spec.type === 'check') return null;
  if (isBlank(display)) return spec.required ? `falta '${colName}'` : null;
  if (spec.type === 'list' && !canonical(spec.values, display)) return `'${colName}' inválido '${display}' (use a lista)`;
  if ((spec.type === 'regex' || spec.type === 'range') && spec.pattern && !new RegExp(spec.pattern).test(display)) return `'${colName}' inválido '${display}' — ${spec.help}`;
  return null;
}
function colLetter(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// ---------- menu ----------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Site')
    .addItem('Publicar alterações', 'publicar')
    .addItem('Verificar folha', 'verificar')
    .addItem('Ver avisos do site', 'verAvisos')
    .addSeparator()
    .addSubMenu(
      SpreadsheetApp.getUi()
        .createMenu('Admin')
        .addItem('Configurar folha (validações, exemplos, LEIA-ME)', 'configurarFolha')
        .addItem('Configurar publicação (URL + segredo)', 'configurarPublicacao'),
    )
    .addToUi();
}

/** Gatilho simples: quando muda a equipa (ou os coaches extra), atualiza o menu de coaches. */
function onEdit(e) {
  if (!e || !e.range) return;
  const name = e.range.getSheet().getName();
  if (name === 'equipa' || name === LISTS_TAB) {
    try {
      refreshCoaches(e.source);
    } catch (err) {
      console.warn('refreshCoaches: ' + err.message);
    }
  }
}

// ---------- leitura ----------

/** Cabeçalho = primeira linha não vazia (como o parser). */
function headerOf(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const top = sheet.getRange(1, 1, Math.min(10, sheet.getMaxRows()), lastCol).getDisplayValues();
  const i = top.findIndex((r) => r.some((c) => !isBlank(c)));
  if (i < 0) return null;
  const cols = {};
  top[i].forEach((h, j) => {
    const k = normHeader(h);
    if (k && !cols[k]) cols[k] = j + 1;
  });
  return { row: i + 1, cols, lastCol };
}

/** Problemas da folha inteira, em português, por separador e linha. */
function findProblems() {
  const ss = SpreadsheetApp.getActive();
  const out = [];
  Object.keys(TABS).forEach((name) => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return out.push(`${name}: separador em falta (o site não publica nada até voltar)`);
    const h = headerOf(sheet);
    if (!h) return out.push(`${name}: separador vazio`);
    const last = sheet.getLastRow();
    if (last <= h.row) return;
    const vals = sheet.getRange(h.row + 1, 1, last - h.row, h.lastCol).getValues();
    const disp = sheet.getRange(h.row + 1, 1, last - h.row, h.lastCol).getDisplayValues();
    const spec = TABS[name].cols;
    Object.keys(spec).forEach((c) => {
      if (!h.cols[c] && (spec[c].required || c === 'ativo')) out.push(`${name}: falta a coluna '${c}'`);
    });
    vals.forEach((row, i) => {
      if (!row.some((c) => !isBlank(c) && c !== false)) return; // linha vazia
      const a = h.cols.ativo ? toBool(row[h.cols.ativo - 1], true) : true;
      if (a === false) return; // escondida: o site ignora-a sem aviso
      const n = h.row + 1 + i;
      if (a === null) return out.push(`${name}, linha ${n}: 'ativo' não reconhecido`);
      const errs = Object.keys(spec)
        .filter((c) => h.cols[c])
        .map((c) => cellProblem(spec[c], disp[i][h.cols[c] - 1], c))
        .filter(Boolean);
      if (errs.length) out.push(`${name}, linha ${n}: ${errs.join('; ')}`);
    });
  });

  const cfg = ss.getSheetByName('config');
  if (!cfg) out.push('config: separador em falta (o site não publica nada até voltar)');
  else {
    const h = headerOf(cfg);
    const keyCol = h && h.cols.chave;
    const valCol = h && (h.cols.pt || h.cols.valor);
    if (!keyCol || !valCol) out.push("config: faltam as colunas 'chave' e 'pt'");
    else if (cfg.getLastRow() > h.row) {
      const rows = cfg.getRange(h.row + 1, 1, cfg.getLastRow() - h.row, h.lastCol).getDisplayValues();
      const map = {};
      rows.forEach((r) => (map[fold(r[keyCol - 1])] = r[valCol - 1]));
      CONFIG_REQUIRED.forEach((k) => isBlank(map[k]) && out.push(`config: '${k}' está vazio (o site não publica até ser preenchido)`));
      CONFIG_MUST_EXIST.forEach((k) => !(k in map) && out.push(`config: falta a chave '${k}' (vazio = fechado, mas a linha tem de existir)`));
      Object.keys(map).forEach((k) => {
        const p = configValueProblem(k, map[k]);
        if (!p) return;
        const blocks = CONFIG_REQUIRED.indexOf(k) >= 0 || CONFIG_MUST_EXIST.indexOf(k) >= 0;
        out.push(`config '${k}': ${p}` + (blocks ? ' (o site não publica até ser corrigido)' : ' (o site ignora este valor)'));
      });
    }
  }
  return out;
}

// ---------- ações do menu ----------

function verificar() {
  const ui = SpreadsheetApp.getUi();
  const p = findProblems();
  if (!p.length) return ui.alert('Tudo certo', 'Não encontrei problemas na folha.', ui.ButtonSet.OK);
  ui.alert(`${p.length} problema(s)`, 'Estas linhas não aparecem no site:\n\n' + p.slice(0, 25).join('\n') + (p.length > 25 ? `\n… e mais ${p.length - 25}` : ''), ui.ButtonSet.OK);
}

function publicar() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const base = props.getProperty('SITE_URL');
  const secret = props.getProperty('REVALIDATE_SECRET');
  if (!base || !secret) {
    return ui.alert('Falta configurar', 'Peça ao administrador para usar Site → Admin → Configurar publicação.\n\nEntretanto, as alterações aparecem sozinhas no site em até 5 minutos.', ui.ButtonSet.OK);
  }
  const p = findProblems();
  if (p.length) {
    const r = ui.alert(
      `${p.length} problema(s) na folha`,
      p.slice(0, 10).join('\n') + (p.length > 10 ? `\n… e mais ${p.length - 10}` : '') + '\n\nEstas linhas não vão aparecer no site. Publicar mesmo assim?',
      ui.ButtonSet.YES_NO,
    );
    if (r !== ui.Button.YES) return;
  }
  SpreadsheetApp.flush();
  let res;
  try {
    res = UrlFetchApp.fetch(base.replace(/\/+$/, '') + '/api/revalidate', {
      method: 'post',
      headers: { 'x-revalidate-secret': secret },
      muteHttpExceptions: true,
    });
  } catch (e) {
    return ui.alert('Não consegui contactar o site', String(e.message || e) + '\n\nAs alterações aparecem sozinhas em até 5 minutos.', ui.ButtonSet.OK);
  }
  const code = res.getResponseCode();
  if (code === 200) return SpreadsheetApp.getActive().toast('Publicado. O site mostra as alterações na próxima visita.', 'Site', 8);
  if (code === 401) return ui.alert('Segredo errado', 'O site recusou o pedido. Peça ao administrador para rever Site → Admin → Configurar publicação.', ui.ButtonSet.OK);
  if (code === 429) {
    const wait = Number(res.getHeaders()['Retry-After'] || res.getHeaders()['retry-after'] || 60);
    return ui.alert('Demasiados pedidos', `O site está a limitar os pedidos. Tente de novo daqui a ${Math.ceil(wait / 60)} minuto(s).\n\nAs alterações aparecem sozinhas em até 5 minutos.`, ui.ButtonSet.OK);
  }
  if (code === 503) return ui.alert('Site por configurar', 'O site ainda não tem o segredo de publicação configurado (REVALIDATE_SECRET no Vercel). Avise o administrador.\n\nAs alterações aparecem sozinhas em até 5 minutos.', ui.ButtonSet.OK);
  ui.alert('Erro do site', `HTTP ${code}. As alterações aparecem sozinhas em até 5 minutos.`, ui.ButtonSet.OK);
}

function verAvisos() {
  const base = PropertiesService.getScriptProperties().getProperty('SITE_URL');
  const ui = SpreadsheetApp.getUi();
  if (!base) return ui.alert('Falta configurar', 'Site → Admin → Configurar publicação.', ui.ButtonSet.OK);
  const url = base.replace(/\/+$/, '') + '/status';
  const html = HtmlService.createHtmlOutput(
    `<p style="font-family:sans-serif">Avisos que o site encontrou ao ler a folha:</p>` +
      `<p style="font-family:sans-serif"><a href="${url}" target="_blank">${url}</a></p>`,
  ).setWidth(420).setHeight(120);
  ui.showModalDialog(html, 'Avisos do site');
}

function configurarPublicacao() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const cur = props.getProperty('SITE_URL') || '';
  const a = ui.prompt('URL do site', `Ex.: https://caravelas-site.vercel.app/testsite/caravelas\nAtual: ${cur || '(nenhum)'}\nDeixe vazio para manter.`, ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const url = a.getResponseText().trim();
  if (url) {
    if (!/^https:\/\/\S+$/.test(url)) return ui.alert('URL inválido (tem de começar por https://).');
    props.setProperty('SITE_URL', url.replace(/\/+$/, ''));
  }
  const b = ui.prompt('Segredo', 'O valor de REVALIDATE_SECRET no Vercel. Deixe vazio para manter o atual.', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  const s = b.getResponseText().trim();
  if (s) props.setProperty('REVALIDATE_SECRET', s);
  SpreadsheetApp.getActive().toast('Publicação configurada.', 'Site', 5);
}

// ---------- configurar folha (admin) ----------

// Separador de argumentos das fórmulas de validação/formatação: depende da região da folha
// ("," em inglês, ";" em português/espanhol). Detetado uma vez por execução.
let SEP = null;
function detectSep(ss) {
  // Sobras de execuções interrompidas.
  ss.getSheets().forEach((sh) => {
    if (sh.getName().indexOf('__teste_site') === 0) {
      try {
        ss.deleteSheet(sh);
      } catch (e) {}
    }
  });
  const tmp = ss.insertSheet('__teste_site_' + Date.now());
  try {
    for (const sep of [',', ';']) {
      try {
        tmp.getRange('A1').setDataValidation(SpreadsheetApp.newDataValidation().requireFormulaSatisfied(`=OR(ISBLANK(A1)${sep}LEN(A1)>0)`).build());
        SpreadsheetApp.flush(); // a Google só valida (e lança o erro) ao aplicar
        return sep;
      } catch (e) {}
    }
    return null;
  } finally {
    try {
      ss.deleteSheet(tmp);
    } catch (e) {}
  }
}
/** Fórmula com os argumentos separados por SEP: f('OR', 'a', 'b') -> "OR(a;b)". */
function f(name, ...args) {
  return `${name}(${args.join(SEP || ',')})`;
}

function configurarFolha() {
  const ss = SpreadsheetApp.getActive();
  SEP = detectSep(ss);
  setupListas(ss);
  const done = [];
  const skipped = [];
  Object.keys(TABS).forEach((name) => {
    const sheet = ss.getSheetByName(name);
    if (!sheet || !headerOf(sheet)) return skipped.push(name);
    setupTab(sheet, TABS[name]);
    done.push(name);
  });
  const cfg = ss.getSheetByName('config');
  if (cfg && headerOf(cfg)) {
    setupConfig(cfg);
    done.push('config');
  } else skipped.push('config');
  writeReadme(ss);
  // Esconder 'listas' no fim, com outro separador ativo (a Google não esconde o separador ativo).
  ss.setActiveSheet(ss.getSheetByName(README_TAB));
  SpreadsheetApp.flush();
  ss.getSheetByName(LISTS_TAB).hideSheet();
  SpreadsheetApp.getUi().alert(
    'Folha configurada',
    `Separadores: ${done.join(', ')}` +
      (SEP ? '' : '\nAviso: não consegui criar as validações de formato nesta região; use Site → Verificar folha.') +
      (skipped.length ? `\nNão encontrados: ${skipped.join(', ')}` : '') + `\n\nVeja o separador ${README_TAB}.`,
    SpreadsheetApp.getUi().ButtonSet.OK,
  );
}

function setupTab(sheet, tab) {
  let h = headerOf(sheet);
  const spec = tab.cols;

  // 1. Linha de exemplo logo abaixo do cabeçalho (só uma vez; marcada com uma nota).
  const firstData = sheet.getRange(h.row + 1, 1);
  const hasExample = String(firstData.getNote() || '').indexOf(TAG) === 0;
  const firstEmpty = sheet
    .getRange(h.row + 1, 1, 1, h.lastCol)
    .getDisplayValues()[0]
    .every((c) => isBlank(c) || fold(c) === 'false');
  if (!hasExample && !firstEmpty) sheet.insertRowBefore(h.row + 1);
  if (!hasExample) sheet.getRange(h.row + 1, 1).setNote(`${TAG} exemplo`); // marca já, para não inserir outra se algo falhar

  // 2. Linhas suficientes e intervalo de dados.
  const start = h.row + 1;
  const end = Math.max(sheet.getLastRow(), h.row + PREPARED_ROWS);
  if (sheet.getMaxRows() < end) sheet.insertRowsAfter(sheet.getMaxRows(), end - sheet.getMaxRows());
  const nRows = end - start + 1;
  const lastCol = h.lastCol;
  const data = sheet.getRange(start, 1, nRows, lastCol);
  const rowHasData = data.getDisplayValues().map((r) => r.some((c) => !isBlank(c) && fold(c) !== 'false'));

  // 3. Regras por coluna.
  Object.keys(spec).forEach((col) => {
    const c = h.cols[col];
    if (!c) return;
    const s = spec[col];
    const range = sheet.getRange(start, c, nRows, 1);
    const top = colLetter(c) + start;
    if (s.type === 'check') {
      const vals = range.getValues().map((r, i) => {
        const b = toBool(r[0], s.defaultOn && rowHasData[i]);
        return [b === null ? false : b];
      });
      range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
      range.setValues(vals);
      range.setHorizontalAlignment('center');
    } else if (s.type === 'list') {
      const vals = range.getValues().map((r) => [isBlank(r[0]) ? '' : canonical(s.values, r[0]) || r[0]]);
      range.setValues(vals);
      range.setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(s.values, true).setAllowInvalid(false).setHelpText('Escolha da lista.').build(),
      );
    } else if (s.type === 'range') {
      const raw = range.getValues();
      const shown = range.getDisplayValues();
      range.setNumberFormat('@').setValues(
        raw.map((r, i) => {
          const v = typeof r[0] === 'string' ? r[0] : shown[i][0];
          if (isBlank(v)) return [''];
          if (s.source === 'horas') return [normTime(v) || v];
          return [v === 'Nome do coach' ? '' : v]; // exemplo antigo
        }),
      );
      const src = listRange(SpreadsheetApp.getActive(), s.source);
      range.setDataValidation(
        SpreadsheetApp.newDataValidation()
          .requireValueInRange(src, true)
          .setAllowInvalid(false)
          .setHelpText(s.source === 'horas' ? 'Escolha a hora da lista (de 15 em 15 min).' : 'Escolha da lista (vem do separador equipa).')
          .build(),
      );
    } else if (s.type === 'regex') {
      if (s.format === '@') {
        // Horas/números já convertidos pela Google (ex.: 7:30 virou hora) -> texto como aparece, antes de mudar o formato.
        const raw = range.getValues();
        const shown = range.getDisplayValues();
        range.setNumberFormat('@').setValues(raw.map((r, i) => [typeof r[0] === 'string' ? r[0] : shown[i][0]]));
      } else if (s.format) range.setNumberFormat(s.format);
      if (!SEP) return; // região desconhecida: sem validação (o menu Verificar continua a apanhar erros)
      try {
        range.setDataValidation(
          SpreadsheetApp.newDataValidation()
            .requireFormulaSatisfied('=' + f('OR', f('ISBLANK', top), f('REGEXMATCH', f('TO_TEXT', top), `"${s.pattern}"`)))
            .setAllowInvalid(false)
            .setHelpText(s.help)
            .build(),
        );
        SpreadsheetApp.flush();
      } catch (e) {
        range.clearDataValidations();
        console.warn(`validação não aplicada em ${sheet.getName()}!${col}: ${e.message}`);
      }
    }
  });

  // 4. Preencher a linha de exemplo (desmarcada = não aparece no site).
  if (!hasExample) {
    const ex = sheet.getRange(start, 1, 1, lastCol);
    ex.clearContent();
    Object.keys(tab.example).forEach((col) => h.cols[col] && sheet.getRange(start, h.cols[col]).setValue(tab.example[col]));
    if (h.cols.ativo) sheet.getRange(start, h.cols.ativo).setValue(false);
    if (h.cols.destaque && spec.destaque) sheet.getRange(start, h.cols.destaque).setValue(false);
    ex.setFontWeight('normal').setFontStyle('italic');
    sheet
      .getRange(start, 1)
      .setNote(`${TAG} Linha de exemplo: não aparece no site porque 'ativo' está desmarcado. Copie-a para criar uma linha nova e marque 'ativo'.`);
  }

  // 5. Formatação condicional: obrigatórias vazias a vermelho; linhas escondidas a cinzento.
  const rules = [];
  const ativo = h.cols.ativo ? '$' + colLetter(h.cols.ativo) + start : null;
  Object.keys(spec).forEach((col) => {
    const c = h.cols[col];
    if (!c || !spec[col].required) return;
    const cell = colLetter(c) + start;
    const empty = `${f('LEN', f('TRIM', f('TO_TEXT', cell)))}=0`;
    const formula = '=' + (ativo ? f('AND', ativo, empty) : empty);
    rules.push(
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formula).setBackground('#f4c7c3').setRanges([sheet.getRange(start, c, nRows, 1)]).build(),
    );
  });
  if (ativo) {
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=' + f('NOT', ativo))
        .setFontColor('#9aa0a6')
        .setBackground('#f3f3f3')
        .setRanges([data])
        .build(),
    );
  }
  if (h.cols.dia) {
    // Um tom por dia, alternado, para ler o horário em blocos (sem unir células: a API só lê a 1.ª).
    const d = '$' + colLetter(h.cols.dia) + start;
    LISTS.dia.forEach((day, i) =>
      rules.push(
        SpreadsheetApp.newConditionalFormatRule()
          .whenFormulaSatisfied(`=${d}="${day}"`)
          .setBackground(i % 2 ? '#ffffff' : '#eef4e4')
          .setRanges([data])
          .build(),
      ),
    );
  }
  try {
    sheet.setConditionalFormatRules(rules);
    SpreadsheetApp.flush();
  } catch (e) {
    sheet.clearConditionalFormatRules();
    console.warn(`cores não aplicadas em ${sheet.getName()}: ${e.message}`);
  }

  // 6. Cabeçalho fixo, em destaque e protegido.
  h = headerOf(sheet);
  styleTable(sheet, h, nRows, { banding: !h.cols.dia });
  protect(sheet, sheet.getRange(h.row, 1, 1, lastCol), 'cabeçalho');
}

function setupConfig(sheet) {
  const h = headerOf(sheet);
  const keyCol = h.cols.chave;
  const valCol = h.cols.pt || h.cols.valor;
  const nRows = Math.max(sheet.getLastRow() - h.row, 1);
  styleTable(sheet, h, nRows, { banding: true });
  protect(sheet, sheet.getRange(h.row, 1, 1, h.lastCol), 'cabeçalho');
  if (!keyCol || !valCol) return;
  protect(sheet, sheet.getRange(h.row + 1, keyCol, nRows, 1), "coluna 'chave'");
  sheet.getRange(h.row + 1, keyCol, nRows, 1).setFontWeight('bold').setFontColor('#3c4a3e');
  const k = '$' + colLetter(keyCol) + (h.row + 1);
  const v = colLetter(valCol) + (h.row + 1);
  const isRequired = f('REGEXMATCH', f('TO_TEXT', k), `"^(${CONFIG_REQUIRED.join('|')})$"`);
  const isEmpty = `${f('LEN', f('TRIM', f('TO_TEXT', v)))}=0`;
  const rules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=' + f('AND', isRequired, isEmpty))
      .setBackground('#f4c7c3')
      .setRanges([sheet.getRange(h.row + 1, valCol, nRows, 1)])
      .build(),
  ];
  // Valores com formato (horários, links, whatsapp, email, instagram): texto simples, validação que
  // recusa valores errados e vermelho se já houver um valor inválido.
  const keys = sheet.getRange(h.row + 1, keyCol, nRows, 1).getDisplayValues().map((r) => normHeader(r[0]));
  keys.forEach((key, i) => {
    const rule = configRule(key);
    if (!rule) return;
    const row = h.row + 1 + i;
    const cell = sheet.getRange(row, valCol);
    if (cell.getNumberFormat() !== '@') {
      const shown = cell.getDisplayValue(); // ex.: 9:00 convertido em hora pela Google -> texto como aparece
      cell.setNumberFormat('@').setValue(shown);
    }
    const a1 = colLetter(valCol) + row;
    const ok = f('REGEXMATCH', f('TO_TEXT', a1), `"${rule.pattern}"`);
    if (SEP) {
      try {
        cell.setDataValidation(
          SpreadsheetApp.newDataValidation()
            .requireFormulaSatisfied('=' + f('OR', f('ISBLANK', a1), ok))
            .setAllowInvalid(false)
            .setHelpText(rule.help)
            .build(),
        );
        SpreadsheetApp.flush();
      } catch (e) {
        cell.clearDataValidations();
        console.warn(`validação não aplicada em config!${a1}: ${e.message}`);
      }
    }
    const notEmpty = `${f('LEN', f('TRIM', f('TO_TEXT', a1)))}>0`;
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=' + f('AND', notEmpty, f('NOT', ok)))
        .setBackground('#f4c7c3')
        .setRanges([cell])
        .build(),
    );
  });
  try {
    sheet.setConditionalFormatRules(rules);
    SpreadsheetApp.flush();
  } catch (e) {
    sheet.clearConditionalFormatRules();
    console.warn(`cores não aplicadas em config: ${e.message}`);
  }
}

// ---------- aspeto de tabela ----------

const STYLE = {
  header: '#1f3d2e', // verde escuro, texto branco
  headerOptional: '#5b7a69', // colunas de tradução (opcionais)
  band: '#f5f8f1',
  border: '#d9e0d4',
};
const OPTIONAL_LANG = /_(en|es|fr|de|ru|uk)$|^(en|es|fr|de|ru|uk)$/;

/** Largura (px) e quebra de linha por coluna. */
function columnLook(key) {
  if (/^(ativo|destaque|ordem)$/.test(key)) return { w: 70, wrap: false, center: true };
  if (key === 'hora') return { w: 72, wrap: false, center: true };
  if (key === 'preco') return { w: 80, wrap: false, center: true };
  if (/^(dia|tipo|icone|foto_lado|inicio|fim)$/.test(key)) return { w: 105, wrap: false };
  if (/^(nome|coach|instagram)$/.test(key)) return { w: 150, wrap: false };
  if (/^(link|chave)$/.test(key) || /_link$/.test(key)) return { w: 210, wrap: false };
  if (/^bio_/.test(key)) return { w: key === 'bio_pt' ? 360 : 200, wrap: false };
  if (key === 'pt' || /_pt$/.test(key)) return { w: 240, wrap: true };
  if (OPTIONAL_LANG.test(key)) return { w: 170, wrap: false };
  return { w: 140, wrap: false };
}

function styleTable(sheet, h, nRows, opts) {
  const lastCol = h.lastCol;
  const header = sheet.getRange(h.row, 1, 1, lastCol);
  const data = sheet.getRange(h.row + 1, 1, nRows, lastCol);
  const keys = sheet.getRange(h.row, 1, 1, lastCol).getDisplayValues()[0].map(normHeader);

  sheet.setFrozenRows(h.row);
  sheet.setRowHeight(h.row, 34);
  header
    .setBackground(STYLE.header)
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setFontStyle('normal')
    .setVerticalAlignment('middle')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  keys.forEach((k, i) => OPTIONAL_LANG.test(k) && sheet.getRange(h.row, i + 1).setBackground(STYLE.headerOptional));

  data.setFontSize(10).setVerticalAlignment('middle');
  [header, data].forEach((r) => r.setBorder(true, true, true, true, true, true, STYLE.border, SpreadsheetApp.BorderStyle.SOLID));
  keys.forEach((k, i) => {
    if (!k) return;
    const look = columnLook(k);
    sheet.setColumnWidth(i + 1, look.w);
    const col = sheet.getRange(h.row + 1, i + 1, nRows, 1);
    col.setWrapStrategy(look.wrap ? SpreadsheetApp.WrapStrategy.WRAP : SpreadsheetApp.WrapStrategy.CLIP);
    sheet.getRange(h.row, i + 1, nRows + 1, 1).setHorizontalAlignment(look.center ? 'center' : 'left');
  });

  sheet.getBandings().forEach((b) => b.remove());
  if (opts.banding) {
    data
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false)
      .setFirstRowColor('#ffffff')
      .setSecondRowColor(STYLE.band);
  }
  sheet.setHiddenGridlines(true);
}

// ---------- separador 'listas' (oculto) ----------
// A: horas possíveis (o admin pode acrescentar, ex. 07:10)
// B: outros_coaches (ex.: "Dinâmico"; o admin edita)
// C: coaches (automático) = nomes da equipa + B, usado pelo menu 'coach' do horario

function listRange(ss, source) {
  const sheet = ss.getSheetByName(LISTS_TAB);
  const col = source === 'horas' ? 1 : 3;
  return sheet.getRange(2, col, LIST_ROWS, 1);
}

function setupListas(ss) {
  let sheet = ss.getSheetByName(LISTS_TAB);
  const isNew = !sheet;
  if (isNew) sheet = ss.insertSheet(LISTS_TAB);
  if (sheet.getMaxRows() < LIST_ROWS + 1) sheet.insertRowsAfter(sheet.getMaxRows(), LIST_ROWS + 1 - sheet.getMaxRows());
  sheet.getRange(1, 1, 1, 3).setValues([['horas', 'outros_coaches', 'coaches (automático, não editar)']]);
  sheet.getRange(1, 1, LIST_ROWS + 1, 3).setNumberFormat('@');

  // Horas: as de defeito + as que já existem na folha + as que o admin acrescentou.
  const hours = new Set(defaultHours());
  sheet
    .getRange(2, 1, LIST_ROWS, 1)
    .getDisplayValues()
    .forEach((r) => normTime(r[0]) && hours.add(normTime(r[0])));
  const extras = new Set(
    sheet
      .getRange(2, 2, LIST_ROWS, 1)
      .getDisplayValues()
      .map((r) => String(r[0]).trim())
      .filter(Boolean),
  );
  const hor = ss.getSheetByName('horario');
  const hh = hor && headerOf(hor);
  const names = new Set(coachNames(ss));
  if (hh && hor.getLastRow() > hh.row) {
    const rows = hor.getRange(hh.row + 1, 1, hor.getLastRow() - hh.row, hh.lastCol).getDisplayValues();
    rows.forEach((r) => {
      if (hh.cols.hora && normTime(r[hh.cols.hora - 1])) hours.add(normTime(r[hh.cols.hora - 1]));
      const c = hh.cols.coach ? String(r[hh.cols.coach - 1]).trim() : '';
      if (c && c !== 'Nome do coach' && !names.has(c)) extras.add(c); // ex.: "Dinâmico"
    });
  }
  writeColumn(sheet, 1, Array.from(hours).sort());
  writeColumn(sheet, 2, Array.from(extras).sort());
  refreshCoaches(ss);

  sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground(STYLE.header).setFontColor('#ffffff');
  sheet.setColumnWidths(1, 3, 220);
  sheet.setFrozenRows(1);
  // A e B: só o dono. C: só aviso, porque o gatilho onEdit escreve lá quando alguém da equipa edita.
  protect(sheet, sheet.getRange(1, 1, LIST_ROWS + 1, 2), 'listas A:B');
  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach((p) => p.getDescription() === `${TAG} listas C` && p.remove());
  sheet.getRange(1, 3, LIST_ROWS + 1, 1).protect().setDescription(`${TAG} listas C`).setWarningOnly(true);
}

function writeColumn(sheet, col, values) {
  const r = sheet.getRange(2, col, LIST_ROWS, 1);
  r.clearContent();
  if (values.length) sheet.getRange(2, col, Math.min(values.length, LIST_ROWS), 1).setValues(values.slice(0, LIST_ROWS).map((v) => [v]));
}

/** Nomes da equipa (sem a linha de exemplo). */
function coachNames(ss) {
  const eq = ss.getSheetByName('equipa');
  const h = eq && headerOf(eq);
  if (!h || !h.cols.nome || eq.getLastRow() <= h.row) return [];
  const n = eq.getLastRow() - h.row;
  const names = eq.getRange(h.row + 1, h.cols.nome, n, 1).getDisplayValues().map((r) => String(r[0]).trim());
  const notes = eq.getRange(h.row + 1, 1, n, 1).getNotes().map((r) => String(r[0]));
  return names.filter((v, i) => v && notes[i].indexOf(TAG) !== 0 && v !== TABS.equipa.example.nome);
}

function refreshCoaches(ss) {
  const sheet = ss.getSheetByName(LISTS_TAB);
  if (!sheet) return;
  const extras = sheet
    .getRange(2, 2, LIST_ROWS, 1)
    .getDisplayValues()
    .map((r) => String(r[0]).trim())
    .filter(Boolean);
  const all = Array.from(new Set(coachNames(ss).concat(extras)));
  writeColumn(sheet, 3, all);
}

/** Protege um intervalo: só o dono edita. Se quem corre não for o dono, fica só como aviso. */
function protect(sheet, range, what) {
  const desc = `${TAG} ${what}`;
  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach((p) => p.getDescription() === desc && p.remove());
  const p = range.protect().setDescription(desc);
  try {
    p.addEditor(Session.getEffectiveUser());
    p.removeEditors(p.getEditors().filter((e) => e.getEmail() !== Session.getEffectiveUser().getEmail()));
    if (p.canDomainEdit()) p.setDomainEdit(false);
  } catch (e) {
    p.setWarningOnly(true);
  }
}

function writeReadme(ss) {
  let sheet = ss.getSheetByName(README_TAB);
  if (!sheet) sheet = ss.insertSheet(README_TAB, 0);
  sheet.clear();
  const lines = [
    ['Como editar o site da CrossFit Caravelas'],
    [''],
    ['Cada separador é uma parte do site: marquesina (faixa de avisos no topo), horario (uma linha por aula), precos, equipa, destaques e config (textos, morada, contactos).'],
    [''],
    ['Linhas'],
    ["• Para criar uma linha nova: copie a linha de exemplo (cinzenta, em itálico, logo abaixo do cabeçalho), cole-a mais abaixo, altere-a e marque 'ativo'."],
    ["• 'ativo' desmarcado = a linha fica escondida no site (e cinzenta aqui). Serve para preparar algo antes de o mostrar."],
    ['• Célula vermelha = falta algo obrigatório. Essa linha não aparece no site até ser preenchida.'],
    ["• 'ordem' é um número (1, 2, 3…). Vazio = a ordem das linhas na folha."],
    [''],
    ['Formatos'],
    ['• dia, hora, tipo, coach, ícone e foto_lado: escolha sempre da lista. A folha recusa outros valores.'],
    ["• hora: de 15 em 15 minutos. Precisa de outra (ex.: 07:10)? Peça ao administrador para a acrescentar."],
    ["• coach: a lista vem do separador equipa. Coach que não deve aparecer na página da equipa: adicione-o em equipa com 'ativo' desmarcado."],
    ['• Preço: 60 ou 60,00.  Datas: dd/mm/aaaa.  Links: começam por https://'],
    ['• Idiomas: as colunas _pt são obrigatórias; _en, _es, _fr, _de, _ru e _uk são opcionais (se vazias, o site mostra inglês ou português).'],
    ['• config: os horários de abertura vazios = fechado (ex.: 07:00-21:00).'],
    [''],
    ['Não fazer'],
    ['• Não mude o nome dos separadores nem a linha de cabeçalhos: o site deixa de os encontrar e continua a mostrar a versão anterior.'],
    ['• Não apague a coluna chave do separador config.'],
    [''],
    ['Publicar'],
    ['• As alterações aparecem sozinhas no site em até 5 minutos.'],
    ['• Para ser imediato: menu Site → Publicar alterações (na primeira vez a Google pede autorização).'],
    ['• Site → Verificar folha mostra as linhas com problemas. Se algo correr mal, o site continua a mostrar a última versão boa.'],
    ['• Para desfazer: Ficheiro → Histórico de versões.'],
  ];
  sheet.getRange(1, 1, lines.length, 1).setValues(lines).setWrap(true).setVerticalAlignment('top');
  sheet.setColumnWidth(1, 820);
  sheet.getRange(1, 1).setFontSize(14).setFontWeight('bold');
  [5, 11, 19, 23].forEach((r) => sheet.getRange(r, 1).setFontWeight('bold'));
  protect(sheet, sheet.getRange(1, 1, lines.length, 1), README_TAB);
}

// Para testes em Node (ignorado no Apps Script).
if (typeof module !== 'undefined') module.exports = { RX, LISTS, TABS, fold, normHeader, toBool, canonical, cellProblem, colLetter, normTime, defaultHours, columnLook, hoursRange, phoneE164, badEmails, configValueProblem, configRule };
