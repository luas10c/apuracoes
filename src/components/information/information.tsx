import styles from '../../styles/information.module.scss'

interface Props {
  white_votes: number
  null_votes: number
  valid_votes: number
  annulled_votes: number
  psi: number
  cands: any[]
}

export const Information = (props: Props) => {
  const {
    white_votes = 0,
    null_votes = 0,
    valid_votes = 0,
    annulled_votes = 0,
    psi = 0,
    cands = []
  } = props

  const diffVotes = (cands: any[]) => {
    return parseInt(cands[0].votes) - parseInt(cands[1].votes)
  };


  return (
    <div className={styles.container}>
      <div>
        <ul>
          <li>
            Concluído:{' '}
            <span>
              {psi}&nbsp;
              <small>%</small>
            </span>
          </li>
          <li>
            Votos válidos:{' '}
            <span>{Intl.NumberFormat('pt-BR').format(valid_votes)}</span>
          </li>
          <li>
            Votos brancos:{' '}
            <span>{Intl.NumberFormat('pt-BR').format(white_votes)}</span>
          </li>
          <li>
            Votos nulos:{' '}
            <span>{Intl.NumberFormat('pt-BR').format(null_votes)}</span>
          </li>
          <li>
            Votos cancelados:{' '}
            <span>{Intl.NumberFormat('pt-BR').format(annulled_votes)}</span>
          </li>
          <li>
            Diferença de votos:{' '}
            <span>{Intl.NumberFormat('pt-BR').format(diffVotes(cands))}</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
