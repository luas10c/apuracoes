import styles from '../../styles/candidates.module.scss'

import { Card } from './card'

interface Props {
  data: any
}

export const Candidates = (props: Props) => {
  const { data } = props

  if (!data) {
    return
  }

  return (
    <div className={styles.container}>
      {data.map((item) => {
        return <Card key={item.id} candidate={item} />
      })}
    </div>
  )
}
