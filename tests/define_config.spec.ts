/**
 * @boringnode/bus
 *
 * @license MIT
 * @copyright BoringNode
 */

import { test } from '@japa/runner'
import { defineConfig } from '../src/define_config.js'
import { MemoryTransport } from '../src/transports/memory.js'

test.group('defineConfig', () => {
  test('returns the given config unchanged', ({ assert }) => {
    const config = {
      default: 'memory' as const,
      transports: {
        memory: {
          transport: () => new MemoryTransport(),
        },
      },
    }

    assert.strictEqual(defineConfig(config), config)
  })

  test('infers the known transport names', ({ expectTypeOf }) => {
    const config = defineConfig({
      default: 'memory',
      transports: {
        memory: {
          transport: () => new MemoryTransport(),
        },
        memory2: {
          transport: () => new MemoryTransport(),
        },
      },
    })

    expectTypeOf(config.default).toEqualTypeOf<'memory' | 'memory2' | undefined>()
  })
})
