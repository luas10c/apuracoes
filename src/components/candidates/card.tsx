import Image from 'next/image'
import LottieView from 'lottie-react'

import styles from '../../styles/card.module.scss'

interface Props {
  candidate: any
}

export const Card = (props: Props) => {
  const { candidate } = props

  return (
    <div
      className={`${styles.container} ${
        candidate.position === 1 ? styles.first : ''
      }`}
    >
      {candidate.position === 1 && !!candidate.status.length && (
        <LottieView
          animationData={require('../../assets/fireworks.json')}
          className={styles.fireworks}
          loop
        />
      )}
      <header className={styles.header}>
        <div className={styles.image}>
          {candidate.party_number === 22 ? (
            <Image
              src={candidate.image_url}
              width={64}
              height={64}
              alt="#"
              blurDataURL="blue"
            />
          ) : (
            <Image
              src={candidate.image_url}
              width={64}
              height={64}
              alt="#"
              blurDataURL="blue"
            />
          )}
        </div>
        <div>
          <h4>{candidate.name}</h4>
          <p>{candidate.name_vice}</p>
        </div>
        <div className={styles.apuracoes}>
          <p className={styles.percentage}>
            {candidate.pvap} <small>%</small>
          </p>
          <span className={styles.votes}>{candidate.votes}</span>
        </div>
      </header>
      {candidate.position === 1 && !!candidate.status.length && (
        <div className={styles.status}>
          <span>{candidate.status}</span>
        </div>
      )}
    </div>
  )
}
