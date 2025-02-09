import { CustomError } from 'ts-custom-error';
import { FromSerializableObjectOptions, fromSerializableObject, toSerializableObject } from '../src';

const serializeAndDeserialize = (obj: unknown, deserializeOptions?: FromSerializableObjectOptions) =>
  fromSerializableObject(JSON.parse(JSON.stringify(toSerializableObject(obj))), deserializeOptions);

describe('serializableObject', () => {
  it('supports plain types', () => {
    expect(serializeAndDeserialize(123)).toEqual(123);
    expect(serializeAndDeserialize('123')).toEqual('123');
    expect(serializeAndDeserialize(true)).toEqual(true);
    expect(serializeAndDeserialize(null)).toEqual(null);
  });

  it('supports nested arrays', () => {
    const obj = [123, [456, 789]];
    expect(serializeAndDeserialize(obj)).toEqual(obj);
  });

  it('supports nested objects', () => {
    const obj = {
      a: {
        b: {
          c: 'c',
          d: 'd'
        }
      }
    };
    expect(serializeAndDeserialize(obj)).toEqual(obj);
  });

  it('supports types that are used in SDK, but not natively supported in JSON', () => {
    const obj = {
      bigint: 123n,
      buffer: Buffer.from('data'),
      date: new Date(),
      error: new Error('error obj'),
      map: new Map([['key', 1n]]),
      set: new Set(['item1', 1n]),
      undefined
    };
    expect(serializeAndDeserialize(obj)).toEqual(obj);
  });

  it('supports custom error types', () => {
    const err = new CustomError('msg');
    const deserialized = serializeAndDeserialize(err, { getErrorPrototype: () => CustomError.prototype });
    expect(deserialized).toEqual(err);
    expect(deserialized).toBeInstanceOf(CustomError);
  });

  it('supports custom transformation discriminator key', () => {
    const customKeyOption = { transformationTypeKey: 'discriminator' };
    const obj = { bigint: 1n };
    const serializedObj = toSerializableObject(obj, customKeyOption);
    expect(fromSerializableObject(serializedObj)).not.toEqual(obj);
    expect(fromSerializableObject(serializedObj, customKeyOption)).toEqual(obj);
  });

  it('supports object key transformation', () => {
    const obj = {
      __a: 'val__a',
      b: 'valb'
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serializableObj: any = toSerializableObject(obj, {
      serializeKey(key) {
        if (key === '__a') return 'key__a';
        return key;
      }
    });
    expect(serializableObj).toEqual({
      b: obj.b,
      key__a: obj.__a
    });
    expect(
      fromSerializableObject(obj, {
        deserializeKey(key) {
          if (key === 'key__a') return '__a';
          return key;
        }
      })
    ).toEqual(obj);
  });
});
