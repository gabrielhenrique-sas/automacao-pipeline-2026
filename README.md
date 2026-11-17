\# Automação Pipeline Apoio Técnico 2026



Automação desenvolvida em \*\*Google Apps Script\*\* para sincronizar os registros de Apoio Técnico de 2026, armazenados em uma planilha Google Sheets, com a tabela `public.apoio\_tecnico` do Supabase.



O projeto foi desenvolvido a partir da lógica do pipeline Python original, preservando suas regras de extração, normalização, deduplicação e comparação.



\## 1. Objetivo



O projeto tem como finalidade identificar registros de Apoio Técnico de 2026 existentes nas planilhas de origem que ainda não estejam registrados no Supabase.



A automação realiza exclusivamente a \*\*inserção de registros ausentes\*\*.



Não são realizadas operações de atualização ou exclusão de registros existentes.



\## 2. Arquitetura



O fluxo de funcionamento é:



1\. Conexão com a planilha Google Sheets.

2\. Leitura das três abas de origem.

3\. Extração dos registros concluídos.

4\. Expansão dos registros por gerência.

5\. Normalização dos dados.

6\. Deduplicação dos registros.

7\. Filtragem dos registros referentes a 2026.

8\. Consulta dos registros existentes no Supabase.

9\. Comparação utilizando uma chave de negócio composta.

10\. Inserção dos registros ausentes.

11\. Conferência final da sincronização.

12\. Envio de relatório por e-mail.



\### Tecnologias utilizadas



\- Google Apps Script (JavaScript V8).

\- Google Sheets.

\- Supabase (PostgreSQL e REST API).

\- Git e GitHub.

\- Clasp (Google Apps Script CLI).



\## 3. Fontes de dados



A automação utiliza uma planilha Google Sheets com três abas:



| Aba | Finalidade |

|---|---|

| `ATM INDIVIDUAIS PRES E REMT` | Registros de Apoio Técnico Individualizado |

| `OFICINAS, ENCONTROS, MUPS, SICON` | Oficinas, encontros e demais atividades presenciais |

| `GOOGLE MEET - RODAS DE DIÁLOGOS` | Rodas de diálogo realizadas pelo Google Meet |



Todas as abas são obrigatórias.



Se alguma aba não puder ser lida, a execução será interrompida para evitar uma sincronização incompleta.



\## 4. Regras de extração



\### 4.1. Status



São considerados exclusivamente os registros cujo campo `Status` ou `Status da Solicitação` seja igual a `Concluído`, respeitando a regra específica de cada aba.



Registros agendados, em análise ou com outros status são ignorados.



\### 4.2. Gerências



A automação verifica as seguintes colunas:



\- GESTÃO

\- GEBEN

\- GEPSB

\- GEPMC

\- GEPAC

\- GETEP

\- GEFEAS

\- VSA

\- CAD



Cada gerência marcada gera um registro individual.



Exemplo:



Uma atividade realizada em determinado município, com as gerências GEPAC e VSA marcadas, gera dois registros no Supabase, diferenciados pelo campo `gerencia`.



\### 4.3. Categoria e evento



Algumas informações são definidas diretamente pelas regras de extração de cada aba.



Exemplos:



\- Apoio Técnico Individualizado: categoria `Apoio Técnico Individualizado` e evento `Apoio Técnico`.

\- Rodas de diálogo: categoria `Roda de Diálogo`.



Os demais campos são extraídos das respectivas colunas da planilha.



\## 5. Normalização e deduplicação



Antes da comparação com o banco, os registros passam por procedimentos de normalização.



Entre eles:



\- Remoção de espaços excedentes.

\- Tratamento de valores vazios.

\- Normalização de maiúsculas e minúsculas.

\- Normalização de acentos na comparação textual.

\- Tratamento de pontuação.

\- Padronização das datas para `YYYY-MM-DD`.



A deduplicação preserva a primeira ocorrência identificada para cada chave de negócio.



\## 6. Chave de negócio



A identificação de registros existentes é realizada por meio de uma chave composta por sete campos:



| Campo de origem | Campo no Supabase |

|---|---|

| Categoria | `categoria` |

| Evento | `evento` |

| Município | `municipio` |

| Data de Realização | `data` |

| GERÊNCIA | `gerencia` |

| Modalidade do Apoio | `modalidade` |

| Tipo de Apoio | `tipo` |



Esses sete campos são utilizados para determinar se um registro já existe no banco.



Campos complementares, como RD, porte populacional, devolutiva e avaliação, não fazem parte da chave de identificação.



Portanto, diferenças nesses campos não são consideradas registros novos quando a chave de negócio permanece igual.



\## 7. Integração com o Supabase



A tabela de destino é:



`public.apoio\_tecnico`



A integração utiliza a API REST do Supabase.



\### Configurações necessárias



As credenciais são armazenadas nas propriedades do Google Apps Script, em:



\*\*Configurações do projeto → Propriedades do script\*\*



| Propriedade | Descrição |

|---|---|

| `SUPABASE\_URL` | URL do projeto Supabase |

| `SUPABASE\_KEY` | Chave secreta de acesso ao Supabase |

| `PLANILHA\_ID` | Identificador da planilha Google Sheets |



A chave deve ser uma chave secreta compatível com o projeto, iniciada por `sb\_secret\_`.



\*\*Importante:\*\* nunca inserir credenciais diretamente no código-fonte ou no GitHub.



\### Consulta ao banco



A consulta é filtrada pelo ano de 2026.



A leitura utiliza paginação para recuperar todos os registros, evitando depender do limite de retorno de uma única requisição.



Configuração atual:



\- Tamanho da página: 1.000 registros.

\- Ordenação por ID, quando disponível.

\- Consulta de todas as páginas até completar a leitura.



\## 8. Segurança das operações



O pipeline foi desenvolvido para operar exclusivamente por inserção.



As regras de segurança são:



\- Não atualizar registros existentes.

\- Não excluir registros.

\- Não substituir registros.

\- Não realizar inserções quando a leitura de alguma aba falhar.

\- Não realizar inserções quando a consulta inicial ao banco retornar vazia.

\- Interromper a execução quando a quantidade de registros ausentes ultrapassar o limite de segurança.

\- Conferir o resultado após a gravação.



\### Limites atuais



| Configuração | Valor |

|---|---:|

| Ano processado | 2026 |

| Tamanho dos lotes de inserção | 100 |

| Limite máximo de inserções por execução | 300 |

| Tamanho da página de consulta | 1.000 |



Esses parâmetros estão definidos no código do pipeline.



\## 9. Tratamento de falhas



Quando uma inserção em lote apresenta erro, o sistema consulta novamente o Supabase antes de tentar inserir os registros individualmente.



Isso evita duplicações em situações nas quais o banco recebeu os dados, mas a resposta da requisição apresentou falha.



Após as tentativas, o pipeline realiza uma nova leitura para verificar quantos registros continuam ausentes.



Resultados incertos não são tratados automaticamente como sucesso.



\## 10. Relatório por e-mail



Ao final da execução, o sistema tenta enviar um relatório para:



`gabriel.henrique@sas.pe.gov.br`



O relatório apresenta:



\- Data e horário da execução.

\- Quantidade de registros encontrados na planilha.

\- Quantidade de registros existentes no Supabase antes da execução.

\- Quantidade de registros que precisavam ser inseridos.

\- Registros confirmados.

\- Município, data, categoria, evento, gerência, modalidade e tipo de apoio.

\- Falhas e resultados incertos.

\- Resultado da conferência final.



\### Cenários possíveis



\*\*Quando existem novos registros:\*\*



O e-mail apresenta a relação dos registros inseridos e confirmados.



\*\*Quando não existem novos registros:\*\*



O e-mail informa que nenhum registro novo foi identificado e que a base já estava sincronizada com a planilha.



\*\*Quando ocorre uma falha:\*\*



O relatório apresenta o erro identificado e as informações disponíveis sobre a execução.



O envio do e-mail é uma etapa de notificação. Uma falha no serviço de e-mail não significa necessariamente que a gravação no Supabase também falhou.



\## 11. Execução automática



O projeto utiliza um acionador baseado em tempo, configurado diretamente na interface do Google Apps Script.



Configuração atual:



| Parâmetro | Valor |

|---|---|

| Função | `executarPipeline2026` |

| Frequência | Diária |

| Horário selecionado | 18h às 19h |

| Fuso horário | `America/Sao\_Paulo` |



O acionador executa o pipeline na infraestrutura do Google, independentemente de o computador estar ligado.



O horário é uma janela de execução, não uma garantia de início exatamente às 18h00.



A execução ocorre utilizando a conta Google que criou o acionador.



\## 12. Estrutura dos arquivos



Estrutura atual do projeto:



```text

Automacao-Pipeline-2026/

│

├── .clasp.json

├── .gitignore

├── appsscript.json

├── Código.js

├── Pipeline.js

└── README.md

```



\### Descrição dos arquivos



| Arquivo | Responsabilidade |

|---|---|

| `Código.js` | Funções de teste de conexão com o Supabase e leitura da planilha |

| `Pipeline.js` | Implementação principal do pipeline, extração, comparação, inserção e envio de relatórios |

| `appsscript.json` | Configurações do projeto Google Apps Script |

| `.clasp.json` | Identificação do projeto Apps Script utilizado pelo Clasp |

| `.gitignore` | Arquivos e informações que não devem ser versionados |

| `README.md` | Documentação do projeto |



O arquivo `Pipeline.js` no ambiente local corresponde ao arquivo `Pipeline.gs` exibido na interface do Apps Script.



\### Configuração do projeto



O manifesto `appsscript.json` utiliza:



\- Runtime: V8.

\- Fuso horário: America/Sao\_Paulo.

\- Registro de exceções: STACKDRIVER.



\## 13. Desenvolvimento e versionamento



O projeto utiliza Git para controle de versões e GitHub para armazenamento remoto do código.



Repositório:



https://github.com/gabrielhenrique-sas/automacao-pipeline-2026



\### Diretório local



```text

C:\\Users\\gabriel.henrique\\Desktop\\Projetos\\Automacao-Pipeline-2026

```



\### Ferramenta Clasp



O Clasp é utilizado para sincronizar os arquivos locais com o projeto Google Apps Script.



Como o PowerShell pode bloquear a execução de arquivos `.ps1`, os comandos são executados utilizando o arquivo `.cmd`:



Consultar o estado:



```powershell

\& "$env:USERPROFILE\\npm-global\\clasp.cmd" status

```



Baixar alterações do Apps Script:



```powershell

\& "$env:USERPROFILE\\npm-global\\clasp.cmd" pull

```



Enviar alterações locais ao Apps Script:



```powershell

\& "$env:USERPROFILE\\npm-global\\clasp.cmd" push

```



\### Fluxo recomendado de versionamento



Antes de qualquer alteração importante:



1\. Consultar o estado do Git.

2\. Sincronizar o projeto com o Apps Script, quando necessário.

3\. Conferir as diferenças entre os arquivos.

4\. Adicionar as alterações ao Git.

5\. Criar um commit com uma descrição objetiva.

6\. Enviar as alterações ao GitHub.



Exemplo:



```powershell

git status



git add .



git commit -m "Descrição da alteração"



git push origin main

```



Atenção: antes de utilizar `git add .`, confira se nenhum arquivo de credenciais ou configuração privada será incluído.



\## 14. Testes disponíveis



O projeto possui funções auxiliares para verificar a integração:



\- `testarConexaoSupabase()`: testa a conexão com o Supabase.

\- `testarLeituraPlanilha()`: verifica a leitura das três abas.



O pipeline principal é executado por:



\- `executarPipeline2026()`



Essa função realiza o processamento completo e tenta enviar o relatório por e-mail.



\## 15. Escopo e evolução futura



Este projeto atende exclusivamente à atualização dos registros referentes ao ano de 2026.



A partir de 2027, a intenção é desenvolver uma nova automação, com regras próprias de extração, comparação e atualização, sem modificar inadvertidamente o funcionamento deste pipeline.



Qualquer alteração neste projeto deve preservar sua característica principal:



\*\*Inserir somente registros ausentes, sem atualizar ou excluir dados já existentes no Supabase.\*\*



\---



\*\*Projeto:\*\* Automação Pipeline Apoio Técnico 2026  

\*\*Plataforma de execução:\*\* Google Apps Script  

\*\*Banco de dados:\*\* Supabase  

\*\*Repositório:\*\* https://github.com/gabrielhenrique-sas/automacao-pipeline-2026  

\*\*Destinatário dos relatórios:\*\* gabriel.henrique@sas.pe.gov.br

