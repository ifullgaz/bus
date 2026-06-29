/**
 * @boringnode/bus
 *
 * @license MIT
 * @copyright BoringNode
 */

import { setTimeout } from 'node:timers/promises'
import { test } from '@japa/runner'
import { Bus } from '../src/bus.js'
import { MemoryTransport } from '../src/transports/memory.js'
import { ChaosTransport } from '../test_helpers/chaos_transport.js'
import type { Serializable, SubscribeHandler, Transport } from '../src/types/main.js'

const kTestingChannel = 'testing-channel'

/**
 * A minimal transport used to exercise the `onReconnect` code path of the
 * Bus. Unlike `MemoryTransport`, it keeps a reference to the reconnect
 * callback so a test can fire it on demand, and `setId` returns `this` so the
 * callback is registered on this instance.
 */
class ReconnectableTransport implements Transport {
  #reconnectCallback: (() => void) | undefined
  #handlers = new Map<string, SubscribeHandler<any>>()

  shouldThrow = false

  setId(_id: string) {
    return this
  }

  onReconnect(callback: () => void) {
    this.#reconnectCallback = callback
  }

  triggerReconnect() {
    this.#reconnectCallback?.()
  }

  async publish(channel: string, message: Serializable) {
    if (this.shouldThrow) {
      throw new Error('transport is down')
    }

    const handler = this.#handlers.get(channel)
    if (handler) handler(message)
  }

  async subscribe<T extends Serializable>(channel: string, handler: SubscribeHandler<T>) {
    this.#handlers.set(channel, handler)
  }

  async unsubscribe(channel: string) {
    this.#handlers.delete(channel)
  }

  async disconnect() {
    this.#handlers.clear()
  }
}

test.group('Bus', () => {
  test('should retry queue processing with an interval', async ({ assert, cleanup }) => {
    const transport1 = new ChaosTransport(new MemoryTransport())
    const transport2 = new ChaosTransport(new MemoryTransport())

    const bus1 = new Bus(transport1, { retryQueue: { retryInterval: '100ms' } })
    const bus2 = new Bus(transport2, { retryQueue: { retryInterval: '100ms' } })

    cleanup(async () => {
      await bus1.disconnect()
      await bus2.disconnect()
    })

    transport1.alwaysThrow()
    transport2.alwaysThrow()

    let count = 0

    await bus1.subscribe(kTestingChannel, () => {
      count++
    })

    await bus2.publish(kTestingChannel, 'test')

    assert.equal(count, 0)

    transport1.neverThrow()
    transport2.neverThrow()

    await setTimeout(200)

    assert.equal(count, 1)
  })

  test('should retry queue processing when asked', async ({ assert, cleanup }) => {
    const transport1 = new ChaosTransport(new MemoryTransport())
    const transport2 = new ChaosTransport(new MemoryTransport())

    const bus1 = new Bus(transport1)
    const bus2 = new Bus(transport2)

    cleanup(async () => {
      await bus1.disconnect()
      await bus2.disconnect()
    })

    transport1.alwaysThrow()
    transport2.alwaysThrow()

    let count = 0

    await bus1.subscribe(kTestingChannel, () => {
      count++
    })

    await bus2.publish(kTestingChannel, 'test')

    assert.equal(count, 0)

    transport1.neverThrow()
    transport2.neverThrow()

    await bus2.processErrorRetryQueue()

    assert.equal(count, 1)
  })

  test('should not retry when retry queue is disabled', async ({ assert, cleanup }) => {
    const transport1 = new ChaosTransport(new MemoryTransport())
    const transport2 = new ChaosTransport(new MemoryTransport())

    const bus1 = new Bus(transport1, { retryQueue: { enabled: false } })
    const bus2 = new Bus(transport2, { retryQueue: { enabled: false } })

    cleanup(async () => {
      await bus1.disconnect()
      await bus2.disconnect()
    })

    transport1.alwaysThrow()
    transport2.alwaysThrow()

    let count = 0

    await bus1.subscribe(kTestingChannel, () => {
      count++
    })

    await bus2.publish(kTestingChannel, 'test')

    assert.equal(count, 0)

    transport1.neverThrow()
    transport2.neverThrow()

    await setTimeout(200)

    assert.equal(count, 0)
  })

  test('should not remove item from queue if publish failed', async ({ assert, cleanup }) => {
    const transport = new ChaosTransport(new MemoryTransport())
    const bus = new Bus(transport, { retryQueue: { enabled: true } })

    cleanup(async () => {
      await bus.disconnect()
    })

    transport.alwaysThrow()

    await bus.publish(kTestingChannel, 'test')

    assert.deepEqual(bus.getRetryQueue().size(), 1)

    await bus.processErrorRetryQueue()

    assert.deepEqual(bus.getRetryQueue().size(), 1)
  })

  test('publish returns true on success and false on failure', async ({ assert, cleanup }) => {
    const transport = new ChaosTransport(new MemoryTransport())
    const bus = new Bus(transport)
    cleanup(() => bus.disconnect())

    assert.isTrue(await bus.publish(kTestingChannel, 'test'))

    transport.alwaysThrow()
    assert.isFalse(await bus.publish(kTestingChannel, 'test'))
  })

  test('publish enqueues failed message when retry queue is enabled', async ({
    assert,
    cleanup,
  }) => {
    const transport = new ChaosTransport(new MemoryTransport())
    const bus = new Bus(transport, { retryQueue: { enabled: true } })
    cleanup(() => bus.disconnect())

    transport.alwaysThrow()

    await bus.publish(kTestingChannel, 'test')

    assert.equal(bus.getRetryQueue().size(), 1)
  })

  test('publish does not enqueue failed message when retry queue is disabled', async ({
    assert,
    cleanup,
  }) => {
    const transport = new ChaosTransport(new MemoryTransport())
    const bus = new Bus(transport, { retryQueue: { enabled: false } })
    cleanup(() => bus.disconnect())

    transport.alwaysThrow()

    const result = await bus.publish(kTestingChannel, 'test')

    assert.isFalse(result)
    assert.equal(bus.getRetryQueue().size(), 0)
  })

  test('subscribe delivers messages emitted by another bus', async ({ assert, cleanup }, done) => {
    const bus1 = new Bus(new MemoryTransport())
    const bus2 = new Bus(new MemoryTransport())

    cleanup(async () => {
      await bus1.disconnect()
      await bus2.disconnect()
    })

    await bus1.subscribe<string>(kTestingChannel, (payload) => {
      assert.equal(payload, 'test')
      done()
    })

    await bus2.publish(kTestingChannel, 'test')
  }).waitForDone()

  test('unsubscribe stops the delivery of messages', async ({ assert, cleanup }) => {
    const bus1 = new Bus(new MemoryTransport())
    const bus2 = new Bus(new MemoryTransport())

    cleanup(async () => {
      await bus1.disconnect()
      await bus2.disconnect()
    })

    let count = 0
    await bus1.subscribe(kTestingChannel, () => {
      count++
    })

    await bus2.publish(kTestingChannel, 'test')
    assert.equal(count, 1)

    await bus1.unsubscribe(kTestingChannel)

    await bus2.publish(kTestingChannel, 'test')
    assert.equal(count, 1)
  })

  test('disconnect clears the retry interval', async ({ assert }) => {
    const transport1 = new ChaosTransport(new MemoryTransport())
    const transport2 = new ChaosTransport(new MemoryTransport())

    const bus1 = new Bus(transport1, { retryQueue: { retryInterval: '50ms' } })
    const bus2 = new Bus(transport2, { retryQueue: { retryInterval: '50ms' } })

    transport1.alwaysThrow()
    transport2.alwaysThrow()

    let count = 0
    await bus1.subscribe(kTestingChannel, () => {
      count++
    })

    await bus2.publish(kTestingChannel, 'test')
    assert.equal(count, 0)

    /**
     * Once disconnected, the interval is cleared so the queued message must
     * never be retried even after the transports recover.
     */
    await bus1.disconnect()
    await bus2.disconnect()

    transport1.neverThrow()
    transport2.neverThrow()

    await setTimeout(150)

    assert.equal(count, 0)
  })

  test('retry interval accepts a numeric value', async ({ assert, cleanup }) => {
    const transport1 = new ChaosTransport(new MemoryTransport())
    const transport2 = new ChaosTransport(new MemoryTransport())

    const bus1 = new Bus(transport1, { retryQueue: { retryInterval: 100 } })
    const bus2 = new Bus(transport2, { retryQueue: { retryInterval: 100 } })

    cleanup(async () => {
      await bus1.disconnect()
      await bus2.disconnect()
    })

    transport1.alwaysThrow()
    transport2.alwaysThrow()

    let count = 0
    await bus1.subscribe(kTestingChannel, () => {
      count++
    })

    await bus2.publish(kTestingChannel, 'test')
    assert.equal(count, 0)

    transport1.neverThrow()
    transport2.neverThrow()

    await setTimeout(200)

    assert.equal(count, 1)
  })

  test('processes the retry queue when the transport reconnects', async ({ assert, cleanup }) => {
    const transport = new ReconnectableTransport()
    const bus = new Bus(transport)
    cleanup(() => bus.disconnect())

    let count = 0
    await bus.subscribe(kTestingChannel, () => {
      count++
    })

    /**
     * While the transport is down the message is parked in the retry queue.
     * Firing the transport's reconnect callback must drain the queue and
     * re-publish the message, which the subscriber then receives.
     */
    transport.shouldThrow = true
    await bus.publish(kTestingChannel, 'test')

    assert.equal(bus.getRetryQueue().size(), 1)
    assert.equal(count, 0)

    transport.shouldThrow = false
    transport.triggerReconnect()

    await setTimeout(50)

    assert.equal(bus.getRetryQueue().size(), 0)
    assert.equal(count, 1)
  })

  test('keeps a single entry when the same payload fails repeatedly', async ({
    assert,
    cleanup,
  }) => {
    const transport = new ChaosTransport(new MemoryTransport())
    const bus = new Bus(transport)
    cleanup(() => bus.disconnect())

    transport.alwaysThrow()

    await bus.publish(kTestingChannel, 'test')
    await bus.publish(kTestingChannel, 'test')

    assert.equal(bus.getRetryQueue().size(), 1)
  })
})
