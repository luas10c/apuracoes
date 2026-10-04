import { beforeAll, beforeEach, afterAll } from '@jest/globals'
import { http, HttpResponse, type HttpHandler } from 'msw'
import { setupServer } from 'msw/node'

const handlers: Array<HttpHandler> = [
  http.get('https://api.example.com', async function () {
    return HttpResponse.json({
      message: 'Hello, World!'
    })
  })
]

const server = setupServer(...handlers)

beforeAll(() => {
  server.listen()
})

beforeEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})
