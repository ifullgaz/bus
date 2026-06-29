/**
 * @boringnode/bus
 *
 * @license MIT
 * @copyright BoringNode
 */

import { test } from '@japa/runner'
import { JsonEncoder } from '../../src/encoders/json_encoder.js'

test.group('JSON Encoder', () => {
  test('json encoder should encode and decode correctly', async ({ assert }) => {
    const data = { busId: 'bus', payload: 'test' }
    const encoder = new JsonEncoder()

    const encodedData = encoder.encode(data)
    const decodedData = encoder.decode(encodedData)

    assert.deepEqual(data, decodedData)
  })

  test('decodes a Buffer payload', ({ assert }) => {
    const data = { busId: 'bus', payload: 'test' }
    const encoder = new JsonEncoder()

    const encoded = encoder.encode(data)
    const decoded = encoder.decode(Buffer.from(encoded))

    assert.deepEqual(decoded, data)
  })

  test('round-trips every serializable payload type', ({ assert }) => {
    const encoder = new JsonEncoder()

    const payloads = [
      null,
      42,
      true,
      'a string',
      ['an', 'array', 1, false],
      { nested: { foo: 'bar', list: [1, 2, 3] } },
    ]

    for (const payload of payloads) {
      const data = { busId: 'bus', payload }
      assert.deepEqual(encoder.decode(encoder.encode(data)), data)
    }
  })
})
