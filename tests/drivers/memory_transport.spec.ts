/**
 * @boringnode/bus
 *
 * @license MIT
 * @copyright BoringNode
 */

import { setTimeout } from 'node:timers/promises'
import { test } from '@japa/runner'
import { MemoryTransport } from '../../src/transports/memory.js'

test.group('Memory Transport', () => {
  test('transport should not receive message emitted by itself', async ({ assert, cleanup }) => {
    const transport = new MemoryTransport().setId('transport')
    cleanup(() => transport.disconnect())

    await transport.subscribe('testing-channel', () => {
      assert.fail('Bus should not receive message emitted by itself')
    })

    await transport.publish('testing-channel', 'test')
    await setTimeout(1000)
  }).disableTimeout()

  test('transport should receive message emitted by another bus', async ({
    assert,
    cleanup,
  }, done) => {
    const transport1 = new MemoryTransport().setId('transport1')
    const transport2 = new MemoryTransport().setId('transport2')

    cleanup(async () => {
      await transport1.disconnect()
      await transport2.disconnect()
    })

    await transport1.subscribe('testing-channel', (payload) => {
      assert.equal(payload, 'test')
      done()
    })

    await transport2.publish('testing-channel', 'test')
  }).waitForDone()

  test('delivers a message to every subscriber on the channel', async ({ assert, cleanup }) => {
    const subscriber1 = new MemoryTransport().setId('subscriber1')
    const subscriber2 = new MemoryTransport().setId('subscriber2')
    const publisher = new MemoryTransport().setId('publisher')

    cleanup(async () => {
      await subscriber1.disconnect()
      await subscriber2.disconnect()
      await publisher.disconnect()
    })

    let count1 = 0
    let count2 = 0
    await subscriber1.subscribe('multi-channel', () => {
      count1++
    })
    await subscriber2.subscribe('multi-channel', () => {
      count2++
    })

    await publisher.publish('multi-channel', 'test')

    assert.equal(count1, 1)
    assert.equal(count2, 1)
  })

  test('unsubscribe only removes the subscription of the calling transport', async ({
    assert,
    cleanup,
  }) => {
    const subscriber1 = new MemoryTransport().setId('subscriber1')
    const subscriber2 = new MemoryTransport().setId('subscriber2')
    const publisher = new MemoryTransport().setId('publisher')

    cleanup(async () => {
      await subscriber1.disconnect()
      await subscriber2.disconnect()
      await publisher.disconnect()
    })

    let count1 = 0
    let count2 = 0
    await subscriber1.subscribe('isolation-channel', () => {
      count1++
    })
    await subscriber2.subscribe('isolation-channel', () => {
      count2++
    })

    await subscriber1.unsubscribe('isolation-channel')
    await publisher.publish('isolation-channel', 'test')

    assert.equal(count1, 0)
    assert.equal(count2, 1)
  })

  test('tracks delivered messages in receivedMessages', async ({ assert, cleanup }) => {
    const subscriber = new MemoryTransport().setId('subscriber')
    const publisher = new MemoryTransport().setId('publisher')

    cleanup(async () => {
      await subscriber.disconnect()
      await publisher.disconnect()
    })

    await subscriber.subscribe('received-channel', () => {})

    await publisher.publish('received-channel', 'first')
    await publisher.publish('received-channel', 'second')

    assert.deepEqual(subscriber.receivedMessages, ['first', 'second'])
  })

  test('publishing to a channel without subscribers does not throw', async ({ assert }) => {
    const transport = new MemoryTransport().setId('publisher')

    await assert.doesNotReject(() => transport.publish('empty-channel', 'test'))
  })

  test('disconnect clears all subscriptions', async ({ assert, cleanup }) => {
    const subscriber = new MemoryTransport().setId('subscriber')
    const publisher = new MemoryTransport().setId('publisher')

    cleanup(async () => {
      await publisher.disconnect()
    })

    let count = 0
    await subscriber.subscribe('disconnect-channel', () => {
      count++
    })

    await subscriber.disconnect()
    await publisher.publish('disconnect-channel', 'test')

    assert.equal(count, 0)
  })
})
