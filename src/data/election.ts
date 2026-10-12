/**
 * Configuração de pleitos do TSE por cargo e turno.
 *
 * O TSE publica cada turno sob um pleito distinto (`-e00XXXX` nas URLs).
 * - Presidente 1T: pleito 6257 (confirmado).
 * - Presidente 2T: pleito AINDA NÃO PUBLICADO pelo TSE — ao publicar
 *   (véspera de 25/out), basta trocar `presidente[2]` abaixo. Enquanto
 *   apontar para o pleito do 1T, o modo 2T apenas espelha os arquivos `-2t`
 *   (útil para validar a plumbing em dev; nunca usar em produção).
 * - Governadores: mesmo pleito (6259) nos dois turnos; no 2T só os estados
 *   com segundo turno têm arquivos — a rota preenche os demais com o
 *   resultado do 1T marcado como `decidido1T`.
 * - Senado/Deputados: turno único (sem 2T).
 */
export type Turno = 1 | 2

export const PLEITOS: Record<'presidente' | 'governador', Record<Turno, string>> = {
  presidente: { 1: '6257', 2: '6257' },
  governador: { 1: '6259', 2: '6259' }
}

/** TODO(2T): trocar pelo pleito do 2º turno quando o TSE publicar. */
export const PLEITO_PRES_2T_PUBLICADO = false

export function pleitoPresidente(turno: Turno): string {
  return PLEITOS.presidente[turno]
}

export function pleitoGovernador(turno: Turno): string {
  return PLEITOS.governador[turno]
}

/** Sufixo dos arquivos de cache/snapshot por turno (`1t` | `2t`). */
export function turnoSuffix(turno: Turno): string {
  return turno === 2 ? '2t' : '1t'
}

/** Rótulo curto do turno para a UI (`1º turno` | `2º turno`). */
export function turnoLabel(turno: Turno): string {
  return turno === 2 ? '2º turno' : '1º turno'
}
