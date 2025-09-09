import { OperationalTransform, Operation, VectorClock } from '../src/server';

describe('OperationalTransform', () => {
  const createOp = (
    type: 'insert' | 'delete' | 'retain',
    position: number,
    content?: string,
    length?: number,
    clientId: string = 'client1'
  ): Operation => ({
    type,
    position,
    content,
    length,
    clientId,
    timestamp: Date.now(),
    vectorClock: { [clientId]: 1 }
  });

  describe('transform insert operations', () => {
    test('should handle concurrent inserts at same position', () => {
      const op1 = createOp('insert', 5, 'hello', undefined, 'client1');
      const op2 = createOp('insert', 5, 'world', undefined, 'client2');

      const result = OperationalTransform.transform(op1, op2, true);
      
      expect(result).toHaveLength(1);
      expect(result[0].position).toBe(15);
      expect(result[0].length).toBe(3);
    });

    test('should not adjust delete when insert is after', () => {
      const deleteOp = createOp('delete', 5, undefined, 3, 'client1');
      const insertOp = createOp('insert', 15, 'hello', undefined, 'client2');

      const result = OperationalTransform.transform(deleteOp, insertOp, false);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(deleteOp);
    });

    test('should split delete when insert is within range', () => {
      const deleteOp = createOp('delete', 5, undefined, 10, 'client1');
      const insertOp = createOp('insert', 8, 'hello', undefined, 'client2');

      const result = OperationalTransform.transform(deleteOp, insertOp, false);
      
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('delete');
      expect(result[0].position).toBe(5);
      expect(result[0].length).toBe(3);
      expect(result[1].type).toBe('delete');
      expect(result[1].position).toBe(13);
      expect(result[1].length).toBe(7);
    });
  });

  describe('vector clock operations', () => {
    test('should merge vector clocks correctly', () => {
      const vc1: VectorClock = { client1: 5, client2: 3 };
      const vc2: VectorClock = { client1: 4, client2: 6, client3: 2 };

      const merged = OperationalTransform.mergeVectorClocks(vc1, vc2);

      expect(merged).toEqual({
        client1: 5,
        client2: 6,
        client3: 2
      });
    });

    test('should compare vector clocks correctly', () => {
      const vc1: VectorClock = { client1: 5, client2: 3 };
      const vc2: VectorClock = { client1: 6, client2: 4 };
      const vc3: VectorClock = { client1: 4, client2: 5 };

      expect(OperationalTransform.compareVectorClocks(vc1, vc2)).toBe('before');
      expect(OperationalTransform.compareVectorClocks(vc2, vc1)).toBe('after');
      expect(OperationalTransform.compareVectorClocks(vc1, vc3)).toBe('concurrent');
    });

    test('should handle empty vector clocks', () => {
      const vc1: VectorClock = {};
      const vc2: VectorClock = { client1: 1 };

      expect(OperationalTransform.compareVectorClocks(vc1, vc2)).toBe('before');
      expect(OperationalTransform.compareVectorClocks(vc2, vc1)).toBe('after');
    });
  });

  describe('complex transformation scenarios', () => {
    test('should handle multiple concurrent operations', () => {
      const doc = 'Hello World';
      const op1 = createOp('insert', 5, ' Beautiful', undefined, 'client1');
      const op2 = createOp('delete', 6, undefined, 5, 'client2');
      const op3 = createOp('insert', 0, 'Hi ', undefined, 'client3');

      let result = OperationalTransform.transform(op1, op2, false);
      result = OperationalTransform.transform(result[0], op3, false);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('insert');
      expect(result[0].content).toBe(' Beautiful');
    });

    test('should maintain operation invariants', () => {
      const operations = [
        createOp('insert', 0, 'A', undefined, 'client1'),
        createOp('insert', 1, 'B', undefined, 'client2'),
        createOp('delete', 0, undefined, 1, 'client3'),
        createOp('insert', 2, 'C', undefined, 'client4')
      ];

      let transformedOps = operations.slice();
      
      for (let i = 0; i < operations.length; i++) {
        for (let j = i + 1; j < operations.length; j++) {
          const result = OperationalTransform.transform(
            transformedOps[i], 
            transformedOps[j], 
            i < j
          );
          transformedOps[i] = result[0];
        }
      }

      transformedOps.forEach(op => {
        expect(op.position).toBeGreaterThanOrEqual(0);
        if (op.type === 'insert') {
          expect(op.content).toBeDefined();
        }
        if (op.type === 'delete') {
          expect(op.length).toBeGreaterThan(0);
        }
      });
    });
  });
});).toHaveLength(1);
      expect(result[0]).toEqual(op1);
    });

    test('should adjust insert position when transformed against earlier insert', () => {
      const op1 = createOp('insert', 10, 'later', undefined, 'client1');
      const op2 = createOp('insert', 5, 'earlier', undefined, 'client2');

      const result = OperationalTransform.transform(op1, op2, false);
      
      expect(result).toHaveLength(1);
      expect(result[0].position).toBe(17);
      expect(result[0].content).toBe('later');
    });

    test('should not adjust insert position when transformed against later insert', () => {
      const op1 = createOp('insert', 5, 'earlier', undefined, 'client1');
      const op2 = createOp('insert', 10, 'later', undefined, 'client2');

      const result = OperationalTransform.transform(op1, op2, false);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(op1);
    });
  });

  describe('transform delete operations', () => {
    test('should handle non-overlapping deletes', () => {
      const op1 = createOp('delete', 5, undefined, 3, 'client1');
      const op2 = createOp('delete', 15, undefined, 2, 'client2');

      const result = OperationalTransform.transform(op1, op2, false);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(op1);
    });

    test('should merge overlapping deletes', () => {
      const op1 = createOp('delete', 5, undefined, 5, 'client1');
      const op2 = createOp('delete', 8, undefined, 4, 'client2');

      const result = OperationalTransform.transform(op1, op2, false);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('delete');
      expect(result[0].position).toBe(5);
      expect(result[0].length).toBe(7);
    });

    test('should adjust delete position when transformed against earlier delete', () => {
      const op1 = createOp('delete', 15, undefined, 3, 'client1');
      const op2 = createOp('delete', 5, undefined, 2, 'client2');

      const result = OperationalTransform.transform(op1, op2, false);
      
      expect(result).toHaveLength(1);
      expect(result[0].position).toBe(13);
      expect(result[0].length).toBe(3);
    });
  });

  describe('transform insert against delete', () => {
    test('should adjust insert position when delete is before', () => {
      const insertOp = createOp('insert', 10, 'hello', undefined, 'client1');
      const deleteOp = createOp('delete', 3, undefined, 4, 'client2');

      const result = OperationalTransform.transform(insertOp, deleteOp, false);
      
      expect(result).toHaveLength(1);
      expect(result[0].position).toBe(6);
      expect(result[0].content).toBe('hello');
    });

    test('should not adjust insert when delete is after', () => {
      const insertOp = createOp('insert', 5, 'hello', undefined, 'client1');
      const deleteOp = createOp('delete', 15, undefined, 3, 'client2');

      const result = OperationalTransform.transform(insertOp, deleteOp, false);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(insertOp);
    });

    test('should handle insert within delete range', () => {
      const insertOp = createOp('insert', 7, 'hello', undefined, 'client1');
      const deleteOp = createOp('delete', 5, undefined, 5, 'client2');

      const result = OperationalTransform.transform(insertOp, deleteOp, false);
      
      expect(result).toHaveLength(1);
      expect(result[0].position).toBe(5);
    });
  });

  describe('transform delete against insert', () => {
    test('should adjust delete position when insert is before', () => {
      const deleteOp = createOp('delete', 10, undefined, 3, 'client1');
      const insertOp = createOp('insert', 5, 'hello', undefined, 'client2');

      const result = OperationalTransform.transform(deleteOp, insertOp, false);
      
      expect(result
