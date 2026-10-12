/**
 * Partidos: sigla, nome, cor, cor viva e bloco.
 * Chaves em maiúsculas para busca insensível a caixa (`AVANTE`/`Avante`).
 * `corViva` segue a pesquisa de cores da referência (mapa `PARTIDOS` com
 * fonte em logo/site de cada partido); siglas ausentes caem no cinza.
 */
export type PartyBloc = 'esquerda' | 'centro' | 'direita'

export type PartyInfo = {
  sigla: string
  nome: string
  cor: string
  /** Variante saturada p/ preenchimento do mapa (tabs Senado/Governadores/Deputados). */
  corViva: string
  bloco: PartyBloc
}

export const PARTIES: Record<string, PartyInfo> = {
  PL: { sigla: 'PL', nome: 'Partido Liberal', cor: '#5b8def', corViva: '#4162E2', bloco: 'direita' },
  PT: { sigla: 'PT', nome: 'Partido dos Trabalhadores', cor: '#f87171', corViva: '#EE2D35', bloco: 'esquerda' },
  AVANTE: { sigla: 'Avante', nome: 'Avante', cor: '#0f929c', corViva: '#04A9B7', bloco: 'centro' },
  'MISSÃO': { sigla: 'Missão', nome: 'Missão', cor: '#cda511', corViva: '#CEA608', bloco: 'direita' },
  PSD: { sigla: 'PSD', nome: 'Partido Social Democrático', cor: '#7fbf5a', corViva: '#84C65C', bloco: 'centro' },
  NOVO: { sigla: 'Novo', nome: 'Partido Novo', cor: '#f97316', corViva: '#F87025', bloco: 'direita' },
  UP: { sigla: 'UP', nome: 'Unidade Popular', cor: '#b3afab', corViva: '#B4B0AC', bloco: 'esquerda' },
  PSTU: {
    sigla: 'PSTU',
    nome: 'Partido Socialista dos Trabalhadores Unificado',
    cor: '#d67c7d',
    corViva: '#F38C8E',
    bloco: 'esquerda'
  },
  DC: { sigla: 'DC', nome: 'Democracia Cristã', cor: '#b78832', corViva: '#BC8C30', bloco: 'direita' },
  PCB: { sigla: 'PCB', nome: 'Partido Comunista Brasileiro', cor: '#c36b72', corViva: '#B7535D', bloco: 'esquerda' },
  DEM: { sigla: 'DEM', nome: 'Democratas', cor: '#8fe3ba', corViva: '#8FE3BA', bloco: 'direita' },
  DEMOCRATA: { sigla: 'Democrata', nome: 'Democrata', cor: '#8fe3ba', corViva: '#8FE3BA', bloco: 'direita' },
  MDB: { sigla: 'MDB', nome: 'Movimento Democrático Brasileiro', cor: '#0aa14a', corViva: '#01813A', bloco: 'centro' },
  REPUBLICANOS: { sigla: 'Republicanos', nome: 'Republicanos', cor: '#2f6fed', corViva: '#4181AD', bloco: 'centro' },
  PP: { sigla: 'PP', nome: 'Progressistas', cor: '#29abe2', corViva: '#90E7FF', bloco: 'centro' },
  'UNIÃO': { sigla: 'União', nome: 'União Brasil', cor: '#1f3fae', corViva: '#26C4FF', bloco: 'centro' },
  UNIAO: { sigla: 'União', nome: 'União Brasil', cor: '#1f3fae', corViva: '#26C4FF', bloco: 'centro' },
  PSOL: { sigla: 'PSOL', nome: 'Partido Socialismo e Liberdade', cor: '#a855f7', corViva: '#FAF45A', bloco: 'esquerda' },
  PDT: { sigla: 'PDT', nome: 'Partido Democrático Trabalhista', cor: '#f472b6', corViva: '#DC4C92', bloco: 'esquerda' },
  PSB: { sigla: 'PSB', nome: 'Partido Socialista Brasileiro', cor: '#fbbf24', corViva: '#FFC961', bloco: 'esquerda' },
  PCO: { sigla: 'PCO', nome: 'Partido da Causa Operária', cor: '#de6f6a', corViva: '#DE6F6A', bloco: 'esquerda' },
  PSDB: { sigla: 'PSDB', nome: 'Partido da Social Democracia Brasileira', cor: '#5aa9e6', corViva: '#3994FF', bloco: 'centro' },
  PODE: { sigla: 'PODE', nome: 'Podemos', cor: '#a78bfa', corViva: '#AB6BD6', bloco: 'centro' },
  REDE: { sigla: 'REDE', nome: 'Rede Sustentabilidade', cor: '#5ab0e0', corViva: '#3FC3AE', bloco: 'esquerda' },
  PCDOB: { sigla: 'PCdoB', nome: 'Partido Comunista do Brasil', cor: '#e88080', corViva: '#CE3E57', bloco: 'esquerda' },
  PRD: { sigla: 'PRD', nome: 'Partido Renovação Democrática', cor: '#a5b4fc', corViva: '#14938D', bloco: 'direita' },
  PV: { sigla: 'PV', nome: 'Partido Verde', cor: '#6fce97', corViva: '#719259', bloco: 'esquerda' },
  SOLIDARIEDADE: { sigla: 'Solidariedade', nome: 'Solidariedade', cor: '#fdba74', corViva: '#F78C08', bloco: 'centro' },
  CIDADANIA: { sigla: 'Cidadania', nome: 'Cidadania', cor: '#f473b3', corViva: '#F0289B', bloco: 'centro' },
  PRTB: { sigla: 'PRTB', nome: 'Partido Renovador Trabalhista Brasileiro', cor: '#6cc484', corViva: '#28A650', bloco: 'direita' },
  MOBILIZA: { sigla: 'Mobiliza', nome: 'Mobilização Nacional', cor: '#c97ba8', corViva: '#B24D8B', bloco: 'centro' },
  AGIR: { sigla: 'Agir', nome: 'Agir', cor: '#c2c4ec', corViva: '#A2A5E0', bloco: 'centro' }
}

export const PARTY_FALLBACK_COLOR = '#9ca3af'

/** Cor do partido pela sigla (nulo/vazio/desconhecido → cinza). */
export function partyColor(sg: string | null | undefined): string {
  if (!sg) return PARTY_FALLBACK_COLOR
  return PARTIES[sg.trim().toUpperCase()]?.cor ?? PARTY_FALLBACK_COLOR
}

/** Bloco ideológico p/ a régua Esquerda/Centrão/Direita (desconhecido → centro). */
export function partyBloc(sg: string | null | undefined): PartyBloc {
  if (!sg) return 'centro'
  return PARTIES[sg.trim().toUpperCase()]?.bloco ?? 'centro'
}

/** Cor viva do partido p/ preenchimento do mapa (desconhecido → cinza). */
export function partyVivid(sg: string | null | undefined): string {
  if (!sg) return PARTY_FALLBACK_COLOR
  return PARTIES[sg.trim().toUpperCase()]?.corViva ?? PARTY_FALLBACK_COLOR
}

/** Mistura dois hex (t: 0 → a, 1 → b). */
export function mixHex(a: string, b: string, t: number): string {
  const pa = a.replace('#', '')
  const pb = b.replace('#', '')
  const fa =
    pa.length === 3 ? pa.split('').map((c) => c + c).join('') : pa
  const fb =
    pb.length === 3 ? pb.split('').map((c) => c + c).join('') : pb
  const k = Math.min(1, Math.max(0, t))
  const mix = (i: number) => {
    const va = parseInt(fa.slice(i, i + 2), 16)
    const vb = parseInt(fb.slice(i, i + 2), 16)
    if (Number.isNaN(va) || Number.isNaN(vb)) return '00'
    return Math.round(va + (vb - va) * k)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${mix(0)}${mix(2)}${mix(4)}`
}

/** Mistura um hex com branco (0–1) — usado no estado "claro" (apurando). */
export function tintWithWhite(hex: string, amount: number): string {
  return mixHex(hex, '#ffffff', amount)
}

/** Sombra da cor viva por margem (pp): faixas iguais às do fillFor. */
export function partyShade(sg: string | null | undefined, margin: number): string {
  const base = partyVivid(sg)
  if (margin > 45) return base
  if (margin > 25) return mixHex(base, '#000000', 0.22)
  if (margin > 10) return mixHex(base, '#000000', 0.45)
  return mixHex(base, '#000000', 0.65)
}

/** Identidade do vencedor no mapa (1º/2º colocado nacional). */
export type WinnerIdentity = 'flavio' | 'lula' | 'outro'

/**
 * Cor por identidade de vencedor. Resolve para a cor do partido
 * (flavio→PL, lula→PT) — um único ponto de verdade para a cor.
 */
export const WINNER_COLORS: Record<WinnerIdentity, string> = {
  flavio: PARTIES.PL.cor,
  lula: PARTIES.PT.cor,
  outro: PARTY_FALLBACK_COLOR
}

export function winnerColor(
  w: WinnerIdentity | string | null | undefined
): string {
  if (!w) return PARTY_FALLBACK_COLOR
  return WINNER_COLORS[w as WinnerIdentity] ?? PARTY_FALLBACK_COLOR
}

/** Versões claras p/ pontos e marcadores pequenos sobre fundo escuro. */
export const WINNER_COLORS_LIGHT: Record<WinnerIdentity, string> = {
  flavio: '#93c5fd',
  lula: '#fca5a5',
  outro: PARTY_FALLBACK_COLOR
}

/** Cores da régua Esquerda/Centrão/Direita. */
export const BLOC_COLORS: Record<PartyBloc, string> = {
  esquerda: '#ef4444',
  centro: '#a8a29e',
  direita: '#3b82f6'
}
