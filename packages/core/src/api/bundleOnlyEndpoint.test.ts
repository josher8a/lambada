import { describe, expect, test } from 'bun:test'
import * as pulumi from '@pulumi/pulumi'
import { IsEndpointsArgs } from './createApi'
import { createEndpointSimpleCompat, LambadaEndpointArgs } from './createEndpoint'

const created: pulumi.runtime.MockResourceArgs[] = []

pulumi.runtime.setMocks({
    newResource: (args: pulumi.runtime.MockResourceArgs) => {
        created.push(args)
        return { id: `${args.name}-id`, state: { ...args.inputs, arn: `arn:${args.name}` } }
    },
    call: () => ({}),
})

const settled = <T>(o: pulumi.Input<T>): Promise<T> =>
    (pulumi.output(o) as unknown as { promise(): Promise<T> }).promise()

const context = { projectName: 'pets', environment: 'test', authorizers: [], environmentVariables: {} }
const bundle = { functionFolder: './dist/getPet', handler: 'index.main' }

describe('an endpoint given only a bundle', () => {
    const endpoint: LambadaEndpointArgs = { name: 'getPet', path: '/pets/{id}', method: 'GET', useBundle: bundle }

    test('is an endpoint', () => {
        expect(IsEndpointsArgs(endpoint)).toBe(true)
    })

    test('deploys the bundle', async () => {
        const route = createEndpointSimpleCompat(endpoint, context as never) as unknown as { eventHandler: { arn: pulumi.Output<string> } }
        await settled(route.eventHandler.arn)

        expect(created.find(r => r.type === 'aws:lambda/function:Function' && r.name === 'getPet-test')!.inputs.handler).toBe('index.main')
    })

    test('cannot be a webhook, which runs its callback', () => {
        expect(() => createEndpointSimpleCompat({ ...endpoint, name: 'hook', webhook: { wrapInQueue: true } } as never, context as never))
            .toThrow('hook is a webhook, which runs its callbackDefinition; a bundle cannot take its place')
    })
})

test('an endpoint needs a callback or a bundle', () => {
    const typeOnly = () => {
        // @ts-expect-error
        const neither: LambadaEndpointArgs = { name: 'nothing', path: '/nothing', method: 'GET' }
        return neither
    }
    expect(typeOnly).toBeFunction()
    expect(() => createEndpointSimpleCompat({ name: 'nothing', path: '/nothing', method: 'GET' } as never, context as never))
        .toThrow('nothing has neither a callbackDefinition nor a bundle to deploy')
})
