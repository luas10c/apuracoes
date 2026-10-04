import { defineConfig } from 'neostaged/config'

export default defineConfig({
  tasks: {
    '**/*.(j|t)s?(x)': ['eslint --cache --concorrency=auto']
  }
})
