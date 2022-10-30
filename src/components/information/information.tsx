import styles from '../../styles/information.module.scss'

interface Props {
  white_votes: number
  null_votes: number
  valid_votes: number
  annulled_votes: number
}

export const Information = (props: Props) => {
  const {
    white_votes = 0,
    null_votes = 0,
    valid_votes = 0,
    annulled_votes = 0
  } = props

  return (
    <div className={styles.container}>
      <div>
        <ul>
          <li>
            Votos válidos: <span>{valid_votes}</span>
          </li>
          <li>
            Votos brancos: <span>{white_votes}</span>
          </li>
          <li>
            Votos nulos: <span>{null_votes}</span>
          </li>
          <li>
            Votos cancelados: <span>{annulled_votes}</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
