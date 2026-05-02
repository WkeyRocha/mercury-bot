/**
 * Gerador de Payload PIX (BR Code / EMV)
 * Padrão Banco Central do Brasil — versão corrigida
 */

// CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF)
function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
    }
  }
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

// Formata campo EMV: ID (2 chars) + tamanho (2 chars) + valor
function emv(id, value) {
  const v   = String(value);
  const len = v.length.toString().padStart(2, '0');
  return `${id}${len}${v}`;
}

// Remove acentos e caracteres inválidos, mantém apenas letras, números e espaço
function normalize(str, maxLen) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // remove acentos
    .replace(/[^a-zA-Z0-9 ]/g, ' ')  // substitui especiais por espaço
    .replace(/\s+/g, ' ')             // colapsa espaços múltiplos
    .trim()
    .substring(0, maxLen)
    .toUpperCase();
}

/**
 * Detecta o tipo da chave PIX e formata corretamente
 */
function formatarChave(chave) {
  const limpa = chave.replace(/\D/g, '');

  // CPF (11 dígitos)
  if (/^\d{11}$/.test(limpa)) return limpa;

  // CNPJ (14 dígitos)
  if (/^\d{14}$/.test(limpa)) return limpa;

  // Telefone (10 ou 11 dígitos com DDD)
  if (/^\d{10,11}$/.test(limpa)) return `+55${limpa}`;

  // E-mail
  if (chave.includes('@')) return chave.toLowerCase().trim();

  // Chave aleatória (UUID) — mantém como está
  return chave.trim();
}

/**
 * Gera o payload PIX (BR Code EMV) para QR Code e Copia e Cola
 *
 * @param {object} opts
 * @param {string} opts.chave   - Chave PIX
 * @param {string} opts.nome    - Nome do recebedor (max 25 chars)
 * @param {string} opts.cidade  - Cidade do recebedor (max 15 chars)
 * @param {number} opts.valor   - Valor da transação
 * @param {string} opts.txid    - ID da transação (alfanumérico, max 25 chars)
 * @returns {string} payload BR Code completo com CRC16
 */
function gerarPayloadPix({ chave, nome, cidade, valor, txid }) {
  const chaveFormatada = formatarChave(chave);
  const nomeNorm       = normalize(nome, 25);
  const cidadeNorm     = normalize(cidade, 15);
  const txidNorm       = txid.replace(/[^a-zA-Z0-9]/g, '').substring(0, 25) || 'SEMTXID';
  const valorStr       = Number(valor).toFixed(2);

  // Campo 26 — Merchant Account Info (PIX)
  // ATENÇÃO: NÃO incluímos o campo 02 (descrição) pois causa
  // rejeição em vários aplicativos bancários
  const campo26 = emv('26',
    emv('00', 'br.gov.bcb.pix') +
    emv('01', chaveFormatada)
  );

  // Campo 62 — Additional Data Field (Reference Label / TXID)
  const campo62 = emv('62', emv('05', txidNorm));

  // Monta payload sem CRC
  const payload =
    emv('00', '01')    +   // Payload Format Indicator
    emv('01', '12')    +   // Point of Initiation Method (12 = QR reutilizável)
    campo26            +   // Merchant Account Info PIX
    emv('52', '0000')  +   // Merchant Category Code (0000 = genérico)
    emv('53', '986')   +   // Transaction Currency (986 = BRL)
    emv('54', valorStr)+   // Transaction Amount
    emv('58', 'BR')    +   // Country Code
    emv('59', nomeNorm)+   // Merchant Name
    emv('60', cidadeNorm)+ // Merchant City
    campo62            +   // Additional Data
    '6304';                // CRC16 placeholder (sem valor ainda)

  return payload + crc16(payload);
}

/**
 * Gera TXID único baseado no usuário Discord + timestamp
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
