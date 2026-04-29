/**
 * Gerador de Payload PIX (BR Code / EMV)
 * Padrão Banco Central do Brasil
 * https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf
 */

// CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF)
function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

// Formata um campo EMV: ID + tamanho (2 dígitos) + valor
function emv(id, value) {
  const len = String(value).length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

// Normaliza strings: remove acentos e caracteres especiais
function normalize(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .substring(0, 25)
    .toUpperCase();
}

/**
 * Gera o payload PIX (string para QR Code)
 *
 * @param {object} opts
 * @param {string} opts.chave      - Chave PIX (aleatória, CPF, e-mail, telefone)
 * @param {string} opts.nome       - Nome do recebedor (max 25 chars)
 * @param {string} opts.cidade     - Cidade do recebedor (max 15 chars)
 * @param {number} opts.valor      - Valor da transação
 * @param {string} opts.txid       - Identificador da transação (max 25 chars, sem espaços)
 * @param {string} [opts.descricao] - Descrição / mensagem (opcional)
 * @returns {string} payload BR Code
 */
function gerarPayloadPix({ chave, nome, cidade, valor, txid, descricao = '' }) {
  const nomeNorm   = normalize(nome).substring(0, 25);
  const cidadeNorm = normalize(cidade).substring(0, 15);
  const txidNorm   = txid.replace(/[^a-zA-Z0-9]/g, '').substring(0, 25) || 'SEMTXID';
  const valorStr   = Number(valor).toFixed(2);

  // Campo 26 — Merchant Account Info (PIX)
  const gui = emv('00', 'br.gov.bcb.pix');
  const key = emv('01', chave);
  const desc = descricao ? emv('02', descricao.substring(0, 72)) : '';
  const merchantAccountInfo = emv('26', `${gui}${key}${desc}`);

  // Campo 62 — Additional Data (txid)
  const refLabel = emv('05', txidNorm);
  const additionalData = emv('62', refLabel);

  // Monta payload sem CRC
  const payload =
    emv('00', '01') +                // Payload Format Indicator
    merchantAccountInfo +             // Merchant Account Info
    emv('52', '0000') +              // MCC (genérico)
    emv('53', '986') +               // Moeda BRL
    emv('54', valorStr) +            // Valor
    emv('58', 'BR') +                // País
    emv('59', nomeNorm) +            // Nome
    emv('60', cidadeNorm) +          // Cidade
    additionalData +                  // Dados adicionais
    '6304';                           // CRC16 placeholder

  return payload + crc16(payload);
}

/**
 * Gera o txid único baseado no usuário Discord e timestamp
 * @param {string} discordUsername - username do Discord (sem #)
 * @returns {string} txid de até 25 chars alfanumérico
 */
function gerarTxid(discordUsername) {
  const ts   = Date.now().toString(36).toUpperCase();
  const user = discordUsername.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10).toUpperCase();
  return `${user}${ts}`.substring(0, 25);
}

/**
 * Formata valor em BRL
 */
function formatarValor(valor) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor);
}

module.exports = { gerarPayloadPix, gerarTxid, formatarValor };
