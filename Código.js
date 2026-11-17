
/**
 * Testa a conexão do Google Apps Script com o Supabase.
 * Operação exclusivamente de leitura.
 */
function testarConexaoSupabase() {
  const propriedades = PropertiesService.getScriptProperties();

  const supabaseUrl = propriedades.getProperty('SUPABASE_URL');
  const supabaseKey = propriedades.getProperty('SUPABASE_KEY');

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Configure SUPABASE_URL e SUPABASE_KEY nas propriedades do script.'
    );
  }

  const urlBase = supabaseUrl.replace(/\/+$/, '');

  const endpoint =
    urlBase + '/rest/v1/apoio_tecnico?select=id&limit=1';

  const resposta = UrlFetchApp.fetch(endpoint, {
    method: 'get',
    headers: {
      apikey: supabaseKey,
      Authorization: 'Bearer ' + supabaseKey,
      Accept: 'application/json'
    },
    muteHttpExceptions: true
  });

  const codigoHttp = resposta.getResponseCode();

  Logger.log('Código HTTP: ' + codigoHttp);

  if (codigoHttp === 200) {
    const dados = JSON.parse(resposta.getContentText());

    Logger.log('Conexão com Supabase estabelecida!');
    Logger.log('Quantidade de registros retornados: ' + dados.length);

    return;
  }

  Logger.log('Erro retornado pelo Supabase: ' +
    resposta.getContentText().substring(0, 1000));

  throw new Error(
    'Falha na conexão com Supabase. Código HTTP: ' + codigoHttp
  );
}


/**
 * Testa a leitura das três abas do Google Sheets.
 * Operação exclusivamente de leitura.
 * Interrompe se alguma aba não puder ser lida.
 */
function testarLeituraPlanilha() {
  const propriedades = PropertiesService.getScriptProperties();

  const planilhaId = propriedades.getProperty('PLANILHA_ID');

  if (!planilhaId) {
    throw new Error('Propriedade PLANILHA_ID não configurada.');
  }

  const planilha = SpreadsheetApp.openById(planilhaId);

  const abasEsperadas = [
    'ATM INDIVIDUAIS PRES E REMT',
    'OFICINAS, ENCONTROS, MUPS, SICON',
    'GOOGLE MEET - RODAS DE DIÁLOGOS'
  ];

  const falhas = [];
  const resumo = [];

  Logger.log('Planilha: ' + planilha.getName());
  Logger.log('Iniciando leitura das três abas...');

  abasEsperadas.forEach(function(nome) {
    try {
      const aba = planilha.getSheetByName(nome);

      if (!aba) {
        throw new Error('Aba não encontrada.');
      }

      const ultimaLinha = aba.getLastRow();
      const ultimaColuna = aba.getLastColumn();

      if (ultimaLinha < 1 || ultimaColuna < 1) {
        throw new Error('Aba vazia ou sem cabeçalho.');
      }

      const dados = aba
        .getRange(1, 1, ultimaLinha, ultimaColuna)
        .getDisplayValues();

      const cabecalhos = dados[0].map(function(valor) {
        return String(valor).replace(/\n/g, ' ').trim();
      });

      const linhasComDados = dados.slice(1).filter(function(linha) {
        return linha.some(function(valor) {
          return String(valor).trim() !== '';
        });
      }).length;

      resumo.push({
        nome: nome,
        linhas: linhasComDados,
        colunas: ultimaColuna
      });

      Logger.log('-----------------------------------');
      Logger.log('ABA: ' + nome);
      Logger.log('Linhas com dados: ' + linhasComDados);
      Logger.log('Colunas: ' + ultimaColuna);
      Logger.log('Cabeçalhos: ' + cabecalhos.join(' | '));

    } catch (erro) {
      falhas.push(nome + ': ' + erro.message);
      Logger.log('FALHA NA ABA ' + nome + ': ' + erro.message);
    }
  });

  if (falhas.length > 0) {
    throw new Error(
      'Leitura abortada. Falha em uma ou mais abas:\n' +
      falhas.join('\n')
    );
  }

  const totalLinhas = resumo.reduce(function(total, item) {
    return total + item.linhas;
  }, 0);

  Logger.log('===================================');
  Logger.log('LEITURA DAS TRÊS ABAS CONCLUÍDA!');
  Logger.log('Total de linhas com dados: ' + totalLinhas);
}

