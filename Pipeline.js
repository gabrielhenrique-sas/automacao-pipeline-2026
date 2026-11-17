
/**
 * PIPELINE APOIO TÉCNICO — 2026
 * Etapa 1: configuração, leitura e conversão das planilhas.
 *
 * Esta etapa NÃO grava nem altera dados no Supabase.
 */

const PIPELINE = {
  ANO: 2026,
  TABELA: 'apoio_tecnico',
  PAGE_SIZE: 1000,
  BATCH_SIZE: 100,
  MAX_INSERCOES: 300,

  ABAS: {
    ATMS: 'ATM INDIVIDUAIS PRES E REMT',
    OFICINAS: 'OFICINAS, ENCONTROS, MUPS, SICON',
    MEET: 'GOOGLE MEET - RODAS DE DIÁLOGOS'
  },

  GERENCIAS: [
    'GESTÃO', 'GEBEN', 'GEPSB', 'GEPMC', 'GEPAC',
    'GETEP', 'GEFEAS', 'VSA', 'CAD'
  ],

  CAMPOS: [
    'Categoria',
    'Evento',
    'Município',
    'RD',
    'PORTE POPULACIONAL 2022',
    'Data de Realização',
    'Modalidade do Apoio',
    'Tipo de Apoio',
    'GERÊNCIA',
    'Devolutiva',
    'Avaliação'
  ],

  CAMPOS_CHAVE: [
    'Categoria',
    'Evento',
    'Município',
    'Data de Realização',
    'GERÊNCIA',
    'Modalidade do Apoio',
    'Tipo de Apoio'
  ]
};


// ============================================================
// 1. CONFIGURAÇÕES E VALIDAÇÕES
// ============================================================

function obterConfigPipeline_() {
  const props = PropertiesService.getScriptProperties();

  const cfg = {
    url: (props.getProperty('SUPABASE_URL') || '').trim(),
    chave: (props.getProperty('SUPABASE_KEY') || '').trim(),
    planilhaId: (props.getProperty('PLANILHA_ID') || '').trim()
  };

  if (!cfg.url || !cfg.chave || !cfg.planilhaId) {
    throw new Error(
      'Configure SUPABASE_URL, SUPABASE_KEY e PLANILHA_ID nas Propriedades do Script.'
    );
  }

  if (!cfg.chave.startsWith('sb_secret_')) {
    throw new Error(
      'A chave do Supabase precisa começar com sb_secret_.'
    );
  }

  if (!cfg.url.startsWith('https://')) {
    throw new Error('SUPABASE_URL inválida.');
  }

  return cfg;
}


// ============================================================
// 2. NORMALIZAÇÃO
// ============================================================

function limparPipeline_(valor) {
  if (valor === null || valor === undefined) return '';

  const s = String(valor).trim();

  if (['nan', 'none', 'nat'].includes(s.toLowerCase())) {
    return '';
  }

  return s;
}


function temConteudoPipeline_(valor) {
  return limparPipeline_(valor) !== '';
}


function isConcluidoPipeline_(valor) {
  return limparPipeline_(valor).toLowerCase() === 'concluído';
}


function normalizarNomePipeline_(nome) {
  return String(nome)
    .normalize('NFC')
    .replace(/[\p{P}\p{S}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}


function normalizarTextoPipeline_(valor) {
  if (valor === null || valor === undefined) return '';

  const s = String(valor).trim();

  if (['nan', 'none', 'nat', ''].includes(s.toLowerCase())) {
    return '';
  }

  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}


function normalizarDataPipeline_(valor) {
  if (valor === null || valor === undefined || valor === '') {
    return '';
  }

  // Data recebida diretamente como objeto Date.
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return Utilities.formatDate(
      valor,
      Session.getScriptTimeZone(),
      'yyyy-MM-dd'
    );
  }

  const s = String(valor).trim();

  if (!s || ['nan', 'none', 'nat'].includes(s.toLowerCase())) {
    return '';
  }

  const formatos = [
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
    /^(\d{2})\/(\d{2})\/(\d{4})\s+\d{2}:\d{2}:\d{2}$/,
    /^(\d{2})\/(\d{2})\/(\d{2})$/,
    /^(\d{4})-(\d{2})-(\d{2})$/,
    /^(\d{4})-(\d{2})-(\d{2})\s+\d{2}:\d{2}:\d{2}$/,
    /^(\d{2})-(\d{2})-(\d{4})$/,
    /^(\d{2})-(\d{2})-(\d{4})\s+\d{2}:\d{2}:\d{2}$/
  ];

  let m;

  // dd/MM/yyyy
  m = s.match(formatos[0]) || s.match(formatos[1]);

  if (m) {
    return validarDataISO_(
      Number(m[3]), Number(m[2]), Number(m[1])
    );
  }

  // dd/MM/yy
  m = s.match(formatos[2]);

  if (m) {
    const ano = Number(m[3]) + 2000;
    return validarDataISO_(ano, Number(m[2]), Number(m[1]));
  }

  // yyyy-MM-dd
  m = s.match(formatos[3]) || s.match(formatos[4]);

  if (m) {
    return validarDataISO_(
      Number(m[1]), Number(m[2]), Number(m[3])
    );
  }

  // dd-MM-yyyy
  m = s.match(formatos[5]) || s.match(formatos[6]);

  if (m) {
    return validarDataISO_(
      Number(m[3]), Number(m[2]), Number(m[1])
    );
  }

  // Timestamp ISO do PostgreSQL.
  m = s.match(/^(\d{4}-\d{2}-\d{2})[T ]/);

  if (m) return m[1];

  return '';
}


function validarDataISO_(ano, mes, dia) {
  const d = new Date(Date.UTC(ano, mes - 1, dia));

  if (
    d.getUTCFullYear() !== ano ||
    d.getUTCMonth() !== mes - 1 ||
    d.getUTCDate() !== dia
  ) {
    return '';
  }

  return [
    String(ano).padStart(4, '0'),
    String(mes).padStart(2, '0'),
    String(dia).padStart(2, '0')
  ].join('-');
}


function dataValidaPipeline_(data) {
  return /^\d{4}-\d{2}-\d{2}$/.test(data) &&
    normalizarDataPipeline_(data) === data;
}


// ============================================================
// 3. LEITURA DAS ABAS
// ============================================================

function encontrarAbaPipeline_(planilha, nomeEsperado) {
  const alvo = normalizarNomePipeline_(nomeEsperado);
  const abas = planilha.getSheets();

  // Primeiro tenta correspondência exata.
  for (const aba of abas) {
    if (normalizarNomePipeline_(aba.getName()) === alvo) {
      return aba;
    }
  }

  // Depois tenta correspondência por trecho.
  for (const aba of abas) {
    if (normalizarNomePipeline_(aba.getName()).includes(alvo)) {
      return aba;
    }
  }

  const disponiveis = abas.map(a => a.getName()).join(', ');

  throw new Error(
    `Aba "${nomeEsperado}" não encontrada. Abas disponíveis: ${disponiveis}`
  );
}


function carregarAbaPipeline_(planilha, nomeEsperado) {
  const aba = encontrarAbaPipeline_(planilha, nomeEsperado);

  const valores = aba.getDataRange().getDisplayValues();

  if (!valores || valores.length < 2) {
    console.warn(`[${nomeEsperado}] Aba vazia ou sem dados.`);
    return [];
  }

  const cabecalhoBruto = valores[0];
  const linhasDados = valores.slice(1);

  // Descobre a última coluna que possui cabeçalho ou algum dado.
  let ultimaColuna = -1;

  for (let i = 0; i < cabecalhoBruto.length; i++) {
    const temCabecalho = String(cabecalhoBruto[i] || '').trim() !== '';

    const temDado = linhasDados.some(linha =>
      i < linha.length && String(linha[i] || '').trim() !== ''
    );

    if (temCabecalho || temDado) {
      ultimaColuna = i;
    }
  }

  if (ultimaColuna < 0) return [];

  const cabecalhoFinal = [];
  const vistos = {};

  for (let i = 0; i <= ultimaColuna; i++) {
    let nome = String(cabecalhoBruto[i] || '').trim();

    if (!nome) nome = `_col_${i}`;

    if (vistos[nome] !== undefined) {
      vistos[nome]++;
      nome = `${nome}_${vistos[nome]}`;
    } else {
      vistos[nome] = 0;
    }

    cabecalhoFinal.push(nome);
  }

  const registros = [];

  linhasDados.forEach((linha, indice) => {
    const objeto = {};
    let possuiDados = false;

    cabecalhoFinal.forEach((coluna, i) => {
      const valor = limparPipeline_(linha[i] || '');
      objeto[coluna] = valor;

      if (valor !== '') possuiDados = true;
    });

    if (possuiDados) {
      // Número real da linha na planilha, considerando cabeçalho na linha 1.
      objeto._linha_orig = indice + 2;
      registros.push(objeto);
    }
  });

  console.log(`[${nomeEsperado}] ${registros.length} linhas carregadas.`);

  return registros;
}


// ============================================================
// 4. AVISOS DE QUALIDADE
// ============================================================

function avisoCampoPipeline_(rotulo, campo, valor, warnings) {
  if (!valor) {
    warnings.push(`${rotulo}: ${campo} vazio`);
  } else if (valor.startsWith('#') || valor.toUpperCase().includes('REF')) {
    warnings.push(`${rotulo}: ${campo} inválido (${valor})`);
  }
}


// ============================================================
// 5. EXTRATOR — ATM INDIVIDUAIS
// ============================================================

function extrairAtmsPipeline_(linhas, warnings) {
  const registros = [];

  linhas.forEach(linha => {
    if (!isConcluidoPipeline_(linha['Status da Solicitação'])) {
      return;
    }

    const municipio = limparPipeline_(linha['Município']);
    if (!municipio) return;

    const numLinha = linha._linha_orig;

    const data =
      normalizarDataPipeline_(linha['Data Realizada']) ||
      normalizarDataPipeline_(linha['Data da Solicitação']);

    const rd = limparPipeline_(linha['RD']);

    const porte =
      limparPipeline_(linha['PORTE POPULACIONAL 2022*']) ||
      limparPipeline_(linha['PORTE POPULACIONAL 2022']);

    const rotulo = `[${PIPELINE.ABAS.ATMS}] linha ${numLinha} (${municipio})`;

    if (!data) warnings.push(`${rotulo}: data ausente`);

    avisoCampoPipeline_(rotulo, 'RD', rd, warnings);
    avisoCampoPipeline_(rotulo, 'Porte', porte, warnings);

    const modalidade = limparPipeline_(linha['Modalidade do Apoio']);
    const tipo = limparPipeline_(linha['Tipo de Apoio']);

    let marcou = false;

    PIPELINE.GERENCIAS.forEach(gerencia => {
      if (temConteudoPipeline_(linha[gerencia])) {
        marcou = true;

        registros.push({
          'Categoria': 'Apoio Técnico Individualizado',
          'Evento': 'Apoio Técnico',
          'Município': municipio,
          'RD': rd,
          'PORTE POPULACIONAL 2022': porte,
          'Data de Realização': data,
          'Modalidade do Apoio': modalidade,
          'Tipo de Apoio': tipo,
          'GERÊNCIA': gerencia,
          'Devolutiva': '',
          'Avaliação': '',
          '_aba': PIPELINE.ABAS.ATMS,
          '_linha': numLinha
        });
      }
    });

    if (!marcou) {
      warnings.push(`${rotulo}: Concluído sem nenhuma gerência marcada`);
    }
  });

  return registros;
}


// ============================================================
// 6. EXTRATOR — OFICINAS, ENCONTROS, MUPS, SICON
// ============================================================

function extrairOficinasPipeline_(linhas, warnings) {
  const registros = [];

  linhas.forEach(linha => {
    if (!isConcluidoPipeline_(linha['Status'])) return;

    const municipio = limparPipeline_(linha['Município']);
    if (!municipio) return;

    const numLinha = linha._linha_orig;

    const data = normalizarDataPipeline_(linha['Data Realizada']);
    const rd = limparPipeline_(linha['RD']);
    const porte = limparPipeline_(linha['PORTE POPULACIONAL']);

    const rotulo = `[${PIPELINE.ABAS.OFICINAS}] linha ${numLinha} (${municipio})`;

    if (!data) warnings.push(`${rotulo}: data ausente`);

    avisoCampoPipeline_(rotulo, 'RD', rd, warnings);
    avisoCampoPipeline_(rotulo, 'Porte', porte, warnings);

    const categoria = limparPipeline_(linha['Categoria']);
    const evento = limparPipeline_(linha['Evento']);
    const modalidade = limparPipeline_(linha['Modalidade']);
    const tipo = limparPipeline_(linha['Tipo de Apoio']);

    let marcou = false;

    PIPELINE.GERENCIAS.forEach(gerencia => {
      if (temConteudoPipeline_(linha[gerencia])) {
        marcou = true;

        registros.push({
          'Categoria': categoria,
          'Evento': evento,
          'Município': municipio,
          'RD': rd,
          'PORTE POPULACIONAL 2022': porte,
          'Data de Realização': data,
          'Modalidade do Apoio': modalidade,
          'Tipo de Apoio': tipo,
          'GERÊNCIA': gerencia,
          'Devolutiva': '',
          'Avaliação': '',
          '_aba': PIPELINE.ABAS.OFICINAS,
          '_linha': numLinha
        });
      }
    });

    if (!marcou) {
      warnings.push(`${rotulo}: Concluído sem nenhuma gerência marcada`);
    }
  });

  return registros;
}


// ============================================================
// 7. EXTRATOR — GOOGLE MEET
// ============================================================

function extrairMeetPipeline_(linhas, warnings) {
  const registros = [];

  linhas.forEach(linha => {
    if (!isConcluidoPipeline_(linha['Status'])) return;

    const municipio = limparPipeline_(linha['Município']);
    if (!municipio) return;

    const numLinha = linha._linha_orig;

    const data = normalizarDataPipeline_(linha['Data Realizada']);
    const rd = limparPipeline_(linha['RD']);
    const porte = limparPipeline_(linha['PORTE POPULACIONAL']);

    const rotulo = `[${PIPELINE.ABAS.MEET}] linha ${numLinha} (${municipio})`;

    if (!data) warnings.push(`${rotulo}: data ausente`);

    avisoCampoPipeline_(rotulo, 'RD', rd, warnings);
    avisoCampoPipeline_(rotulo, 'Porte', porte, warnings);

    const evento = limparPipeline_(linha['Evento']);
    const modalidade = limparPipeline_(linha['Modalidade']);
    const tipo = limparPipeline_(linha['Tipo de Apoio']);

    let marcou = false;

    PIPELINE.GERENCIAS.forEach(gerencia => {
      if (temConteudoPipeline_(linha[gerencia])) {
        marcou = true;

        registros.push({
          'Categoria': 'Roda de Diálogo',
          'Evento': evento,
          'Município': municipio,
          'RD': rd,
          'PORTE POPULACIONAL 2022': porte,
          'Data de Realização': data,
          'Modalidade do Apoio': modalidade,
          'Tipo de Apoio': tipo,
          'GERÊNCIA': gerencia,
          'Devolutiva': '',
          'Avaliação': '',
          '_aba': PIPELINE.ABAS.MEET,
          '_linha': numLinha
        });
      }
    });

    if (!marcou) {
      warnings.push(`${rotulo}: Concluído sem nenhuma gerência marcada`);
    }
  });

  return registros;
}


// ============================================================
// 8. COLETA GERAL DAS TRÊS ABAS
// ============================================================

function coletarRegistrosPipeline_() {
  const cfg = obterConfigPipeline_();

  console.log('Conectando à planilha...');

  const planilha = SpreadsheetApp.openById(cfg.planilhaId);

  const warnings = [];
  const porAba = {};
  const abasComFalha = [];

  const extratores = [
    {
      nome: PIPELINE.ABAS.ATMS,
      funcao: extrairAtmsPipeline_
    },
    {
      nome: PIPELINE.ABAS.OFICINAS,
      funcao: extrairOficinasPipeline_
    },
    {
      nome: PIPELINE.ABAS.MEET,
      funcao: extrairMeetPipeline_
    }
  ];

  extratores.forEach(item => {
    try {
      const linhas = carregarAbaPipeline_(planilha, item.nome);

      porAba[item.nome] = item.funcao(linhas, warnings);

      console.log(
        `${item.nome}: ${porAba[item.nome].length} registros gerados.`
      );

    } catch (erro) {
      console.error(`Falha na aba ${item.nome}: ${erro.message}`);

      porAba[item.nome] = [];
      abasComFalha.push(item.nome);
    }
  });

  // Não permite continuar com leitura incompleta.
  if (abasComFalha.length > 0) {
    throw new Error(
      'Pipeline interrompido. Falha na leitura das abas: ' +
      abasComFalha.join(', ')
    );
  }

  const todosBrutos = Object.values(porAba).flat();

  return {
    porAba: porAba,
    registrosBrutos: todosBrutos,
    warnings: warnings,
    totalBruto: todosBrutos.length,
    abasComFalha: abasComFalha
  };
}


// ============================================================
// 9. TESTE DA ETAPA 1 — NÃO GRAVA NO SUPABASE
// ============================================================

function testarConversaoPlanilha2026() {
  const resultado = coletarRegistrosPipeline_();

  console.log('========================================');
  console.log('TESTE DE CONVERSÃO DA PLANILHA');
  console.log('========================================');

  Object.keys(resultado.porAba).forEach(nome => {
    console.log(
      `${nome}: ${resultado.porAba[nome].length} registros`
    );
  });

  console.log(`Total bruto: ${resultado.totalBruto}`);
  console.log(`Avisos: ${resultado.warnings.length}`);

  console.log('Amostra dos primeiros 5 registros:');

  resultado.registrosBrutos.slice(0, 5).forEach(registro => {
    console.log(JSON.stringify(registro));
  });

  console.log('========================================');
  console.log('TESTE CONCLUÍDO. NENHUM DADO FOI GRAVADO.');
  console.log('========================================');
}


// ============================================================
// 10. CHAVE DE NEGÓCIO E DEDUPLICAÇÃO
// ============================================================

function chaveNegocioPipeline_(r) {
  return JSON.stringify([
    normalizarTextoPipeline_(r['Categoria']),
    normalizarTextoPipeline_(r['Evento']),
    normalizarTextoPipeline_(r['Município']),
    r['Data de Realização'] || '',
    normalizarTextoPipeline_(r['GERÊNCIA']),
    normalizarTextoPipeline_(r['Modalidade do Apoio']),
    normalizarTextoPipeline_(r['Tipo de Apoio'])
  ]);
}


function deduplicarPipeline_(registros) {
  const vistos = new Set();
  const unicos = [];
  const duplicados = [];
  const grupos = new Map();

  registros.forEach(r => {
    const chave = chaveNegocioPipeline_(r);

    if (!grupos.has(chave)) {
      grupos.set(chave, []);
    }

    grupos.get(chave).push(r);

    if (vistos.has(chave)) {
      duplicados.push(r);
    } else {
      vistos.add(chave);
      unicos.push(r);
    }
  });

  const gruposDuplicados = new Map();

  grupos.forEach((ocorrencias, chave) => {
    if (ocorrencias.length > 1) {
      gruposDuplicados.set(chave, ocorrencias);
    }
  });

  return {
    unicos: unicos,
    duplicados: duplicados,
    gruposDuplicados: gruposDuplicados
  };
}


// ============================================================
// 11. FILTRO DO ANO E DATAS INVÁLIDAS
// ============================================================

function prepararPlanilhaPipeline_(registros, ano) {
  const validos = [];
  const ignorados = [];

  registros.forEach(r => {
    const data = normalizarDataPipeline_(r['Data de Realização']);

    if (!dataValidaPipeline_(data)) {
      ignorados.push({
        registro: r,
        motivo: 'Sem data válida'
      });
      return;
    }

    if (Number(data.substring(0, 4)) !== ano) {
      ignorados.push({
        registro: r,
        motivo: `Data fora de ${ano}`
      });
      return;
    }

    validos.push(r);
  });

  return {
    validos: validos,
    ignorados: ignorados
  };
}


// ============================================================
// 12. TESTE COMPLETO DA CONVERSÃO
// ============================================================

function testarConversaoCompleta2026() {
  const coleta = coletarRegistrosPipeline_();

  const dedup = deduplicarPipeline_(coleta.registrosBrutos);

  const preparacao = prepararPlanilhaPipeline_(
    dedup.unicos,
    PIPELINE.ANO
  );

  console.log('========================================');
  console.log('RELATÓRIO DA CONVERSÃO — 2026');
  console.log('========================================');

  console.log(`Registros brutos: ${coleta.totalBruto}`);

  console.log(`Duplicados removidos: ${dedup.duplicados.length}`);

  console.log(`Grupos de duplicatas: ${dedup.gruposDuplicados.size}`);

  console.log(`Registros únicos: ${dedup.unicos.length}`);

  console.log(`Registros válidos de 2026: ${preparacao.validos.length}`);

  console.log(`Registros ignorados: ${preparacao.ignorados.length}`);

  const porMotivo = {};

  preparacao.ignorados.forEach(item => {
    porMotivo[item.motivo] = (porMotivo[item.motivo] || 0) + 1;
  });

  console.log('Distribuição dos ignorados:');

  Object.keys(porMotivo).forEach(motivo => {
    console.log(`${motivo}: ${porMotivo[motivo]}`);
  });

  console.log('----------------------------------------');
  console.log('PRIMEIROS 5 REGISTROS VÁLIDOS');

  preparacao.validos.slice(0, 5).forEach(r => {
    console.log(JSON.stringify(r));
  });

  console.log('----------------------------------------');
  console.log('PRIMEIROS 5 REGISTROS DUPLICADOS');

  dedup.duplicados.slice(0, 5).forEach(r => {
    console.log(JSON.stringify(r));
  });

  console.log('========================================');
  console.log('TESTE FINALIZADO — SEM GRAVAÇÃO NO BANCO');
  console.log('========================================');
}


// ============================================================
// 13. NORMALIZAÇÃO DAS COLUNAS DO SUPABASE
// ============================================================

function normalizarColunaBanco_(nome) {
  return String(nome)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


function normalizarDataBanco_(valor) {
  if (valor === null || valor === undefined) return '';

  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return Utilities.formatDate(
      valor,
      Session.getScriptTimeZone(),
      'yyyy-MM-dd'
    );
  }

  const s = String(valor).trim();

  if (!s || ['nan', 'none', 'nat'].includes(s.toLowerCase())) {
    return '';
  }

  const formatos = [
    /^(\d{4})-(\d{2})-(\d{2})$/,
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
    /^(\d{4})-(\d{2})-(\d{2})\s+\d{2}:\d{2}:\d{2}$/,
    /^(\d{2})\/(\d{2})\/(\d{4})\s+\d{2}:\d{2}:\d{2}$/
  ];

  let m = s.match(formatos[0]) || s.match(formatos[2]);

  if (m) {
    return validarDataISO_(
      Number(m[1]), Number(m[2]), Number(m[3])
    );
  }

  m = s.match(formatos[1]) || s.match(formatos[3]);

  if (m) {
    return validarDataISO_(
      Number(m[3]), Number(m[2]), Number(m[1])
    );
  }

  m = s.match(/^(\d{4}-\d{2}-\d{2})[T ]/);

  if (m) return m[1];

  // Mantém o comportamento do Python para formatos não reconhecidos.
  return s;
}


// ============================================================
// 14. CONSULTA PAGINADA DO SUPABASE
// ============================================================

function consultarPaginaSupabase_(cfg, ano, offset, comOrdem) {
  const inicio = `${ano}-01-01`;
  const fim = `${ano}-12-31`;

  let url =
    cfg.url.replace(/\/+$/, '') +
    '/rest/v1/' + PIPELINE.TABELA +
    '?select=*' +
    '&data=gte.' + inicio +
    '&data=lte.' + fim +
    '&limit=' + PIPELINE.PAGE_SIZE +
    '&offset=' + offset;

  if (comOrdem) {
    url += '&order=id.asc';
  }

  const resposta = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      apikey: cfg.chave,
      Authorization: 'Bearer ' + cfg.chave,
      Accept: 'application/json'
    },
    muteHttpExceptions: true
  });

  const codigo = resposta.getResponseCode();
  const corpo = resposta.getContentText();

  if (codigo < 200 || codigo >= 300) {
    throw new Error(
      `Supabase HTTP ${codigo}: ${corpo.substring(0, 1000)}`
    );
  }

  const dados = JSON.parse(corpo);

  if (!Array.isArray(dados)) {
    throw new Error('Resposta inesperada do Supabase: não é uma lista.');
  }

  return dados;
}


function carregarBancoPipeline_(ano) {
  const cfg = obterConfigPipeline_();

  console.log(`Consultando registros de ${ano} no Supabase...`);

  let comOrdem = true;
  let primeira;

  try {
    primeira = consultarPaginaSupabase_(cfg, ano, 0, true);
  } catch (erro) {
    console.warn(
      'Consulta ordenada por id falhou. Tentando sem ordenação: ' +
      erro.message
    );

    comOrdem = false;
    primeira = consultarPaginaSupabase_(cfg, ano, 0, false);
  }

  const todos = primeira.slice();
  let offset = PIPELINE.PAGE_SIZE;
  let ultima = primeira;

  while (ultima.length === PIPELINE.PAGE_SIZE) {
    ultima = consultarPaginaSupabase_(
      cfg,
      ano,
      offset,
      comOrdem
    );

    todos.push(...ultima);
    offset += PIPELINE.PAGE_SIZE;

    console.log(`Registros consultados até agora: ${todos.length}`);
  }

  console.log(`Supabase: ${todos.length} registros de ${ano}.`);

  return todos;
}


// ============================================================
// 15. IDENTIFICAÇÃO DAS COLUNAS REAIS DO BANCO
// ============================================================

const CAMPOS_BANCO_PIPELINE = [
  ['Categoria', ['categoria']],
  ['Evento', ['evento']],
  ['Município', ['municipio']],
  ['RD', ['rd']],
  [
    'PORTE POPULACIONAL 2022',
    [
      'porte populacional 2022',
      'porte populacional',
      'porte 2022',
      'porte'
    ]
  ],
  [
    'Data de Realização',
    ['data', 'data de realizacao', 'data realizacao']
  ],
  [
    'Modalidade do Apoio',
    ['modalidade do apoio', 'modalidade apoio', 'modalidade']
  ],
  ['Tipo de Apoio', ['tipo de apoio', 'tipo apoio', 'tipo']],
  ['GERÊNCIA', ['gerencia']],
  ['Devolutiva', ['devolutiva']],
  ['Avaliação', ['avaliacao']]
];


function resolverColunasBancoPipeline_(amostra) {
  const indice = {};

  Object.keys(amostra).forEach(coluna => {
    indice[normalizarColunaBanco_(coluna)] = coluna;
  });

  const mapa = {};

  CAMPOS_BANCO_PIPELINE.forEach(([campo, candidatos]) => {
    let encontrada = null;

    for (const candidato of candidatos) {
      if (indice[candidato] !== undefined) {
        encontrada = indice[candidato];
        break;
      }
    }

    if (encontrada !== null) {
      mapa[campo] = encontrada;
    } else if (PIPELINE.CAMPOS_CHAVE.includes(campo)) {
      throw new Error(
        `Coluna obrigatória "${campo}" não encontrada no Supabase. ` +
        `Colunas existentes: ${Object.keys(amostra).join(', ')}`
      );
    } else {
      console.warn(
        `Coluna "${campo}" não encontrada. Será ignorada no envio.`
      );
    }
  });

  return mapa;
}


// ============================================================
// 16. CHAVES DOS REGISTROS DO BANCO
// ============================================================

function chaveBancoPipeline_(registro, mapa) {
  return JSON.stringify([
    normalizarTextoPipeline_(registro[mapa['Categoria']]),
    normalizarTextoPipeline_(registro[mapa['Evento']]),
    normalizarTextoPipeline_(registro[mapa['Município']]),
    normalizarDataBanco_(registro[mapa['Data de Realização']]),
    normalizarTextoPipeline_(registro[mapa['GERÊNCIA']]),
    normalizarTextoPipeline_(registro[mapa['Modalidade do Apoio']]),
    normalizarTextoPipeline_(registro[mapa['Tipo de Apoio']])
  ]);
}


// ============================================================
// 17. COMPARAÇÃO PLANILHA X SUPABASE
// ============================================================

function compararPipeline_(planilha, banco, mapa) {
  const unicosPlanilha = new Map();
  const colisoes = [];

  planilha.forEach(r => {
    const chave = chaveNegocioPipeline_(r);

    if (unicosPlanilha.has(chave)) {
      colisoes.push({
        registro: r,
        registroMantido: unicosPlanilha.get(chave)
      });
    } else {
      unicosPlanilha.set(chave, r);
    }
  });

  const gruposBanco = new Map();

  banco.forEach(r => {
    const chave = chaveBancoPipeline_(r, mapa);

    if (!gruposBanco.has(chave)) {
      gruposBanco.set(chave, []);
    }

    gruposBanco.get(chave).push(r);
  });

  const faltantes = [];
  const extras = [];
  const duplicatasBanco = [];

  unicosPlanilha.forEach((registro, chave) => {
    if (!gruposBanco.has(chave)) {
      faltantes.push(registro);
    }
  });

  gruposBanco.forEach((registros, chave) => {
    if (!unicosPlanilha.has(chave)) {
      extras.push(registros[0]);
    }

    if (registros.length > 1) {
      duplicatasBanco.push({
        chave: chave,
        registros: registros
      });
    }
  });

  return {
    unicosPlanilha: unicosPlanilha,
    faltantes: faltantes,
    extras: extras,
    duplicatasBanco: duplicatasBanco,
    colisoes: colisoes
  };
}


// ============================================================
// 18. TESTE DE COMPARAÇÃO — SOMENTE LEITURA
// ============================================================

function testarComparacaoSupabase2026() {
  console.log('========================================');
  console.log('INÍCIO DA COMPARAÇÃO — 2026');
  console.log('========================================');

  // 1. Ler e converter as três abas.
  const coleta = coletarRegistrosPipeline_();

  // 2. Deduplicar.
  const dedup = deduplicarPipeline_(coleta.registrosBrutos);

  // 3. Separar registros de 2026.
  const preparacao = prepararPlanilhaPipeline_(
    dedup.unicos,
    PIPELINE.ANO
  );

  const planilha = preparacao.validos;

  if (planilha.length === 0) {
    throw new Error(
      'Nenhum registro válido encontrado na planilha. Comparação abortada.'
    );
  }

  // 4. Consultar Supabase.
  const banco = carregarBancoPipeline_(PIPELINE.ANO);

  if (banco.length === 0) {
    throw new Error(
      'O Supabase não retornou registros de 2026. ' +
      'Comparação abortada para evitar uma possível inserção duplicada.'
    );
  }

  // 5. Descobrir as colunas.
  const mapa = resolverColunasBancoPipeline_(banco[0]);

  console.log('Colunas identificadas no banco:');

  Object.keys(mapa).forEach(campo => {
    console.log(`${campo} → ${mapa[campo]}`);
  });

  // 6. Comparar as chaves.
  const comparacao = compararPipeline_(planilha, banco, mapa);

  console.log('----------------------------------------');
  console.log('RESULTADO DA COMPARAÇÃO');
  console.log('----------------------------------------');

  console.log(`Registros na planilha: ${planilha.length}`);
  console.log(`Registros no Supabase: ${banco.length}`);
  console.log(`Faltantes no banco: ${comparacao.faltantes.length}`);
  console.log(`Extras no banco: ${comparacao.extras.length}`);
  console.log(
    `Chaves duplicadas no banco: ${comparacao.duplicatasBanco.length}`
  );
  console.log(`Colisões na planilha: ${comparacao.colisoes.length}`);

  console.log('----------------------------------------');
  console.log('AMOSTRA DE REGISTROS FALTANTES');

  comparacao.faltantes.slice(0, 10).forEach(r => {
    console.log(JSON.stringify(r));
  });

  console.log('----------------------------------------');
  console.log('AMOSTRA DE EXTRAS NO BANCO');

  comparacao.extras.slice(0, 10).forEach(r => {
    console.log(JSON.stringify(r));
  });

  console.log('----------------------------------------');
  console.log('AMOSTRA DE DUPLICATAS NO BANCO');

  comparacao.duplicatasBanco.slice(0, 5).forEach(grupo => {
    console.log(JSON.stringify(grupo.registros));
  });

  console.log('========================================');
  console.log('COMPARAÇÃO CONCLUÍDA.');
  console.log('NENHUM REGISTRO FOI INSERIDO, ATUALIZADO OU EXCLUÍDO.');
  console.log('========================================');

  // Retorno útil para futuras etapas.
  return {
    planilha: planilha,
    banco: banco,
    mapa: mapa,
    comparacao: comparacao
  };
}


// ============================================================
// 19. MONTAGEM DO PAYLOAD PARA O SUPABASE
// ============================================================

function montarPayloadPipeline_(registro, mapa) {
  const payload = {};

  Object.keys(mapa).forEach(campo => {
    const colunaBanco = mapa[campo];
    let valor = registro[campo];

    if (valor === undefined || valor === null) {
      valor = null;
    } else if (typeof valor === 'string') {
      valor = valor.trim() || null;
    }

    if (campo === 'Data de Realização' && valor) {
      valor = normalizarDataBanco_(valor);
    }

    payload[colunaBanco] = valor;
  });

  return payload;
}


// ============================================================
// 20. SIMULAÇÃO DE GRAVAÇÃO — DRY-RUN
// ============================================================

function testarDryRunPipeline2026() {
  const ANO = PIPELINE.ANO;
  const TAMANHO_LOTE = 100;
  const LIMITE_INSERCOES = 300;

  console.log('========================================');
  console.log('PIPELINE 2026 — SIMULAÇÃO DRY-RUN');
  console.log('========================================');

  // ETAPA 1 — Coletar dados da planilha.
  console.log('ETAPA 1 — Lendo a planilha...');

  const coleta = coletarRegistrosPipeline_();

  if (coleta.abasComFalha && coleta.abasComFalha.length > 0) {
    throw new Error(
      'Falha na leitura das abas. Execução abortada.'
    );
  }

  const dedup = deduplicarPipeline_(coleta.registrosBrutos);

  if (dedup.unicos.length === 0) {
    throw new Error(
      'Nenhum registro encontrado na planilha. Execução abortada.'
    );
  }

  const preparacao = prepararPlanilhaPipeline_(
    dedup.unicos,
    ANO
  );

  const planilha = preparacao.validos;

  console.log(`Registros brutos: ${coleta.registrosBrutos.length}`);
  console.log(`Registros únicos: ${dedup.unicos.length}`);
  console.log(`Registros válidos de ${ANO}: ${planilha.length}`);
  console.log(`Registros ignorados: ${preparacao.ignorados.length}`);

  // ETAPA 2 — Consultar o banco.
  console.log('ETAPA 2 — Consultando o Supabase...');

  const banco = carregarBancoPipeline_(ANO);

  if (banco.length === 0) {
    throw new Error(
      `O Supabase não retornou registros de ${ANO}. ` +
      'Execução abortada por segurança.'
    );
  }

  const mapa = resolverColunasBancoPipeline_(banco[0]);

  // ETAPA 3 — Comparar.
  console.log('ETAPA 3 — Comparando os registros...');

  const comparacao = compararPipeline_(
    planilha,
    banco,
    mapa
  );

  const faltantes = comparacao.faltantes;

  // ETAPA 4 — Aplicar limite de segurança.
  if (faltantes.length > LIMITE_INSERCOES) {
    throw new Error(
      `Foram encontrados ${faltantes.length} registros faltantes. ` +
      `O limite de segurança desta execução é ${LIMITE_INSERCOES}. ` +
      'Nenhuma gravação foi realizada.'
    );
  }

  // ETAPA 5 — Simular a montagem dos lotes.
  console.log('ETAPA 4 — Simulando os lotes de inserção...');

  const lotes = [];

  for (let i = 0; i < faltantes.length; i += TAMANHO_LOTE) {
    const registrosLote = faltantes.slice(
      i,
      i + TAMANHO_LOTE
    );

    const payloadLote = registrosLote.map(registro =>
      montarPayloadPipeline_(registro, mapa)
    );

    lotes.push(payloadLote);

    console.log(
      `[DRY-RUN] Lote ${lotes.length}: ` +
      `${payloadLote.length} registros preparados.`
    );
  }

  // ETAPA 6 — Relatório.
  console.log('========================================');
  console.log('RELATÓRIO DA SIMULAÇÃO');
  console.log('========================================');

  console.log(`Ano: ${ANO}`);
  console.log(`Registros na planilha: ${planilha.length}`);
  console.log(`Registros no Supabase: ${banco.length}`);
  console.log(`Registros faltantes: ${faltantes.length}`);
  console.log(`Registros extras no banco: ${comparacao.extras.length}`);
  console.log(
    `Chaves duplicadas no banco: ${comparacao.duplicatasBanco.length}`
  );
  console.log(`Colisões na planilha: ${comparacao.colisoes.length}`);
  console.log(`Lotes preparados: ${lotes.length}`);
  console.log(`Tamanho máximo por lote: ${TAMANHO_LOTE}`);
  console.log(`Limite de inserções: ${LIMITE_INSERCOES}`);

  console.log('----------------------------------------');
  console.log('PRÉVIA DOS PAYLOADS');

  if (lotes.length === 0) {
    console.log('Nenhum payload preparado: não há registros faltantes.');
  } else {
    lotes[0].slice(0, 3).forEach(payload => {
      console.log(JSON.stringify(payload));
    });
  }

  console.log('========================================');
  console.log('SIMULAÇÃO CONCLUÍDA.');
  console.log('NENHUMA GRAVAÇÃO FOI ENVIADA AO SUPABASE.');
  console.log('NENHUM REGISTRO FOI ATUALIZADO OU EXCLUÍDO.');
  console.log('========================================');

  return {
    ano: ANO,
    totalPlanilha: planilha.length,
    totalBanco: banco.length,
    faltantes: faltantes.length,
    extras: comparacao.extras.length,
    duplicatasBanco: comparacao.duplicatasBanco.length,
    colisoes: comparacao.colisoes.length,
    lotes: lotes.length,
    payloads: lotes
  };
}


// ============================================================
// 21. INSERÇÃO NO SUPABASE
// ============================================================

function inserirLoteSupabasePipeline_(payloads) {
  const cfg = obterConfigPipeline_();

  const url =
    cfg.url.replace(/\/+$/, '') +
    '/rest/v1/' + PIPELINE.TABELA;

  const resposta = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: cfg.chave,
      Authorization: 'Bearer ' + cfg.chave,
      Prefer: 'return=minimal'
    },
    payload: JSON.stringify(payloads),
    muteHttpExceptions: true
  });

  const codigo = resposta.getResponseCode();
  const corpo = resposta.getContentText();

  if (codigo < 200 || codigo >= 300) {
    throw new Error(
      `Supabase HTTP ${codigo}: ${corpo.substring(0, 1500)}`
    );
  }

  return true;
}


// ============================================================
// 22. CONFERÊNCIA DAS CHAVES EXISTENTES
// ============================================================

function obterChavesBancoPipeline_(banco, mapa) {
  const chaves = new Set();

  banco.forEach(registro => {
    chaves.add(chaveBancoPipeline_(registro, mapa));
  });

  return chaves;
}


// ============================================================
// 23. EXECUÇÃO REAL DO PIPELINE 2026
// ============================================================

function executarPipeline2026_Interno() {
  const ANO = PIPELINE.ANO;
  const TAMANHO_LOTE = 100;
  const LIMITE_INSERCOES = 300;

  console.log('========================================');
  console.log('PIPELINE 2026 — EXECUÇÃO REAL');
  console.log('========================================');

  // ETAPA 1 — Coleta da planilha.
  console.log('ETAPA 1 — Lendo a planilha...');

  const coleta = coletarRegistrosPipeline_();

  if (coleta.abasComFalha && coleta.abasComFalha.length > 0) {
    throw new Error(
      'Falha na leitura de uma ou mais abas. Execução abortada.'
    );
  }

  const dedup = deduplicarPipeline_(coleta.registrosBrutos);

  if (dedup.unicos.length === 0) {
    throw new Error(
      'Nenhum registro encontrado na planilha. Execução abortada.'
    );
  }

  const preparacao = prepararPlanilhaPipeline_(
    dedup.unicos,
    ANO
  );

  const planilha = preparacao.validos;

  console.log(`Registros únicos: ${dedup.unicos.length}`);
  console.log(`Registros válidos de ${ANO}: ${planilha.length}`);
  console.log(`Registros ignorados: ${preparacao.ignorados.length}`);

  // ETAPA 2 — Leitura do banco.
  console.log('ETAPA 2 — Consultando o Supabase...');

  const banco = carregarBancoPipeline_(ANO);

  if (banco.length === 0) {
    throw new Error(
      `O Supabase não retornou registros de ${ANO}. ` +
      'Execução abortada por segurança.'
    );
  }

  const mapa = resolverColunasBancoPipeline_(banco[0]);

  // ETAPA 3 — Comparação.
  console.log('ETAPA 3 — Comparando os registros...');

  const comparacao = compararPipeline_(
    planilha,
    banco,
    mapa
  );

  const faltantes = comparacao.faltantes;

  console.log(`Registros faltantes: ${faltantes.length}`);
  console.log(`Registros extras: ${comparacao.extras.length}`);
  console.log(
    `Chaves duplicadas no banco: ${comparacao.duplicatasBanco.length}`
  );

  // ETAPA 4 — Proteção de segurança.
  if (faltantes.length > LIMITE_INSERCOES) {
    throw new Error(
      `Foram encontrados ${faltantes.length} registros faltantes. ` +
      `Limite de segurança: ${LIMITE_INSERCOES}. ` +
      'Nenhuma gravação foi realizada.'
    );
  }

  if (faltantes.length === 0) {
    console.log('Nenhum registro novo para inserir.');

    console.log('========================================');
    console.log('EXECUÇÃO CONCLUÍDA — BANCO JÁ SINCRONIZADO');
    console.log('Nenhuma alteração realizada.');
    console.log('========================================');

    return {
      inseridosOuConfirmados: 0,
      falhas: 0,
      faltantesAposGravacao: 0,
      erroVerificacao: null,
      registrosConfirmados: [],
      totalPlanilha: planilha.length,
      totalBancoInicial: banco.length,
      totalFaltantes: 0
    };
  }

  // ETAPA 5 — Inserção em lotes.
  console.log('ETAPA 4 — Iniciando inserções...');

  const confirmados = new Set();
  const falhas = [];

  for (let i = 0; i < faltantes.length; i += TAMANHO_LOTE) {
    const lote = faltantes.slice(i, i + TAMANHO_LOTE);
    const numeroLote = Math.floor(i / TAMANHO_LOTE) + 1;

    const payloads = lote.map(registro =>
      montarPayloadPipeline_(registro, mapa)
    );

    console.log(
      `Enviando lote ${numeroLote}: ${lote.length} registros...`
    );

    try {
      inserirLoteSupabasePipeline_(payloads);

      lote.forEach(registro => {
        confirmados.add(chaveNegocioPipeline_(registro));
      });

      console.log(
        `Lote ${numeroLote}: ${lote.length} registros enviados com sucesso.`
      );

      continue;

    } catch (erroLote) {
      console.error(
        `Lote ${numeroLote} apresentou erro: ${erroLote.message}`
      );
    }

    // Se o lote falhou, consultar novamente antes de tentar.
    console.log(
      `Conferindo no banco os registros do lote ${numeroLote}...`
    );

    let bancoAtual;

    try {
      bancoAtual = carregarBancoPipeline_(ANO);

    } catch (erroLeitura) {
      const motivo =
        'Resultado incerto; nova tentativa cancelada. ' +
        'Falha na conferência: ' + erroLeitura.message;

      lote.forEach(registro => {
        falhas.push({
          registro: registro,
          motivo: motivo
        });
      });

      continue;
    }

    let chavesAtuais = obterChavesBancoPipeline_(
      bancoAtual,
      mapa
    );

    const ausentes = [];

    lote.forEach(registro => {
      const chave = chaveNegocioPipeline_(registro);

      if (chavesAtuais.has(chave)) {
        confirmados.add(chave);

        console.warn(
          'Registro já encontrado após falha: ' +
          registro['Município'] + ' / ' +
          registro['GERÊNCIA']
        );
      } else {
        ausentes.push(registro);
      }
    });

    // Tentar individualmente apenas o que não foi encontrado.
    for (const registro of ausentes) {
      const chave = chaveNegocioPipeline_(registro);

      try {
        inserirLoteSupabasePipeline_([
          montarPayloadPipeline_(registro, mapa)
        ]);

        confirmados.add(chave);

        console.log(
          'Inserção individual concluída: ' +
          registro['Município'] + ' / ' +
          registro['GERÊNCIA']
        );

      } catch (erroIndividual) {
        console.error(
          'Erro na inserção individual: ' +
          erroIndividual.message
        );

        // Não presumir que a gravação falhou.
        // Consultar novamente antes de registrar falha.
        try {
          const bancoFinal = carregarBancoPipeline_(ANO);

          const chavesFinais = obterChavesBancoPipeline_(
            bancoFinal,
            mapa
          );

          if (chavesFinais.has(chave)) {
            confirmados.add(chave);

            console.warn(
              'Registro confirmado no banco após erro de resposta.'
            );

          } else {
            falhas.push({
              registro: registro,
              motivo: erroIndividual.message
            });
          }

        } catch (erroConferencia) {
          falhas.push({
            registro: registro,
            motivo:
              erroIndividual.message +
              ' | Falha na conferência: ' +
              erroConferencia.message
          });
        }
      }
    }
  }

  // ETAPA 6 — Conferência final.
  console.log('ETAPA 5 — Conferindo o resultado no Supabase...');

  let faltantesAposGravacao = null;
  let erroVerificacao = null;

  try {
    const bancoFinal = carregarBancoPipeline_(ANO);

    const comparacaoFinal = compararPipeline_(
      planilha,
      bancoFinal,
      mapa
    );

    faltantesAposGravacao =
      comparacaoFinal.faltantes.length;

    console.log(
      `Faltantes após a gravação: ${faltantesAposGravacao}`
    );

  } catch (erro) {
    erroVerificacao = erro.message;

    console.error(
      'Não foi possível realizar a conferência final: ' +
      erroVerificacao
    );
  }

  // ETAPA 7 — Relatório.
  console.log('========================================');
  console.log('RELATÓRIO FINAL — PIPELINE 2026');
  console.log('========================================');

  console.log(`Registros na planilha: ${planilha.length}`);
  console.log(`Registros no banco inicialmente: ${banco.length}`);
  console.log(`Registros que precisavam ser inseridos: ${faltantes.length}`);
  console.log(`Registros confirmados como existentes: ${confirmados.size}`);
  console.log(`Falhas ou resultados incertos: ${falhas.length}`);

  if (faltantesAposGravacao !== null) {
    console.log(
      `Faltantes após a gravação: ${faltantesAposGravacao}`
    );
  } else {
    console.log('Conferência final: NÃO CONCLUÍDA');
  }

  falhas.forEach((item, indice) => {
    console.error(
      `Falha ${indice + 1}: ` +
      `${item.registro['Município']} / ` +
      `${item.registro['GERÊNCIA']} — ${item.motivo}`
    );
  });

  console.log('========================================');

  if (erroVerificacao) {
    console.error(
      'ATENÇÃO: não foi possível confirmar a sincronização final.'
    );
  } else if (faltantesAposGravacao === 0 && falhas.length === 0) {
    console.log('SUCESSO: planilha e Supabase estão sincronizados.');
  } else {
    console.warn(
      'ATENÇÃO: existem registros que precisam de nova conferência.'
    );
  }

  console.log('Nenhum registro foi atualizado ou excluído.');
  console.log('========================================');

  return {
    inseridosOuConfirmados: confirmados.size,
    falhas: falhas.length,
    faltantesAposGravacao: faltantesAposGravacao,
    erroVerificacao: erroVerificacao,

    registrosConfirmados: faltantes.filter(registro =>
      confirmados.has(chaveNegocioPipeline_(registro))
    ),

    registrosComFalha: falhas,

    totalPlanilha: planilha.length,
    totalBancoInicial: banco.length,
    totalFaltantes: faltantes.length
  };
}


/**
 * Executa o pipeline e envia o relatório por e-mail.
 * Esta é a função que deverá ser executada manualmente
 * ou pelo acionador diário.
 */
function executarPipeline2026() {
  const destinatario = 'gabriel.henrique@sas.pe.gov.br';

  let resultado;
  let erroExecucao = null;

  try {
    resultado = executarPipeline2026_Interno();

  } catch (erro) {
    erroExecucao = erro.message || String(erro);

    console.error(
      'Falha na execução do pipeline: ' + erroExecucao
    );

    resultado = {
      inseridosOuConfirmados: 0,
      falhas: 0,
      faltantesAposGravacao: null,
      erroVerificacao: erroExecucao,
      registrosConfirmados: [],
      registrosComFalha: [],
      totalPlanilha: null,
      totalBancoInicial: null,
      totalFaltantes: null
    };
  }

  try {
    enviarRelatorioPipeline2026_(
      destinatario,
      resultado,
      erroExecucao
    );

    console.log('Relatório enviado para: ' + destinatario);

  } catch (erroEmail) {
    console.error(
      'Não foi possível enviar o relatório: ' +
      erroEmail.message
    );
  }

  if (erroExecucao) {
    throw new Error(
      'Pipeline interrompido. Consulte o relatório por e-mail. ' +
      erroExecucao
    );
  }

  return resultado;
}


/**
 * Monta e envia o relatório da execução.
 */
function enviarRelatorioPipeline2026_(
  destinatario,
  resultado,
  erroExecucao
) {
  const agora = new Date();

  const dataHora = Utilities.formatDate(
    agora,
    'America/Sao_Paulo',
    'dd/MM/yyyy HH:mm:ss'
  );

  const registros = resultado.registrosConfirmados || [];
  const falhas = resultado.registrosComFalha || [];

  const houveErro =
    Boolean(erroExecucao) ||
    Boolean(resultado.erroVerificacao) ||
    falhas.length > 0 ||
    resultado.faltantesAposGravacao !== 0;

  const nenhumNovo =
    !houveErro &&
    registros.length === 0 &&
    resultado.totalFaltantes === 0;

  let assunto;

  if (houveErro) {
    assunto = 'ATENÇÃO — Pipeline Apoio Técnico 2026';
  } else if (nenhumNovo) {
    assunto = 'Pipeline Apoio Técnico 2026 — Nenhuma inclusão';
  } else {
    assunto = 'Pipeline Apoio Técnico 2026 — Registros incluídos';
  }

  let status;

  if (houveErro) {
    status = 'EXECUÇÃO COM PENDÊNCIAS OU FALHAS';
  } else if (nenhumNovo) {
    status = 'NENHUM REGISTRO NOVO';
  } else {
    status = 'EXECUÇÃO CONCLUÍDA';
  }

  let corpo = '';

  corpo += 'RELATÓRIO DO PIPELINE — APOIO TÉCNICO 2026\n';
  corpo += '========================================\n\n';

  corpo += 'Data e horário: ' + dataHora + '\n';
  corpo += 'Status: ' + status + '\n\n';

  corpo += 'RESUMO DA EXECUÇÃO\n';
  corpo += '----------------------------------------\n';

  corpo += 'Registros na planilha: ' +
    (resultado.totalPlanilha ?? 'Não disponível') + '\n';

  corpo += 'Registros no Supabase antes: ' +
    (resultado.totalBancoInicial ?? 'Não disponível') + '\n';

  corpo += 'Registros que precisavam ser inseridos: ' +
    (resultado.totalFaltantes ?? 'Não disponível') + '\n';

  corpo += 'Registros confirmados: ' +
    registros.length + '\n';

  corpo += 'Falhas: ' + falhas.length + '\n';

  corpo += 'Faltantes após gravação: ' +
    (resultado.faltantesAposGravacao ?? 'Não verificado') + '\n\n';

  if (nenhumNovo) {
    corpo += 'AVISO\n';
    corpo += '----------------------------------------\n';
    corpo += 'Nenhum registro novo foi identificado.\n';
    corpo += 'A base já estava sincronizada com a planilha.\n\n';
  }

  if (registros.length > 0) {
    corpo += 'REGISTROS INSERIDOS OU CONFIRMADOS\n';
    corpo += '----------------------------------------\n';

    registros.forEach((r, i) => {
      corpo += '\n' + (i + 1) + '. ' +
        (r['Município'] || '') + '\n';

      corpo += '   Data: ' +
        (r['Data de Realização'] || '') + '\n';

      corpo += '   Categoria: ' +
        (r['Categoria'] || '') + '\n';

      corpo += '   Evento: ' +
        (r['Evento'] || '') + '\n';

      corpo += '   Gerência: ' +
        (r['GERÊNCIA'] || '') + '\n';

      corpo += '   Modalidade: ' +
        (r['Modalidade do Apoio'] || '') + '\n';

      corpo += '   Tipo de apoio: ' +
        (r['Tipo de Apoio'] || '') + '\n';
    });

    corpo += '\n';
  }

  if (falhas.length > 0) {
    corpo += 'REGISTROS COM FALHA OU RESULTADO INCERTO\n';
    corpo += '----------------------------------------\n';

    falhas.forEach((item, i) => {
      corpo += '\n' + (i + 1) + '. ' +
        (item.registro['Município'] || '') + ' / ' +
        (item.registro['GERÊNCIA'] || '') + '\n';

      corpo += '   Motivo: ' + item.motivo + '\n';
    });

    corpo += '\n';
  }

  if (erroExecucao) {
    corpo += 'ERRO NA EXECUÇÃO\n';
    corpo += '----------------------------------------\n';
    corpo += erroExecucao + '\n\n';
  }

  if (resultado.erroVerificacao) {
    corpo += 'ERRO NA CONFERÊNCIA FINAL\n';
    corpo += '----------------------------------------\n';
    corpo += resultado.erroVerificacao + '\n\n';
  }

  corpo += 'SEGURANÇA\n';
  corpo += '----------------------------------------\n';
  corpo += 'O pipeline não atualiza nem exclui registros existentes.\n';
  corpo += 'Sua operação é exclusivamente de inserção de registros ausentes.\n\n';

  corpo += 'Relatório gerado automaticamente pelo Google Apps Script.';

  MailApp.sendEmail({
    to: destinatario,
    subject: assunto,
    body: corpo,
    name: 'Pipeline Apoio Técnico 2026'
  });
}



