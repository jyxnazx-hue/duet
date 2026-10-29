import { useState, useRef, useCallback } from 'react';
import { createShapeId, toRichText } from 'tldraw';

/**
 * useCanvasAnimator
 * Fixed arrow schema with valid point coordinates
 */
export function useCanvasAnimator(editor) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const abortRef = useRef(false);

  const stopAnimation = useCallback(() => {
    abortRef.current = true;
    setIsAnimating(false);
  }, []);

  const runSequence = useCallback(async (actions, delayMs = 600) => {
    if (!editor || !actions || actions.length === 0) return;

    abortRef.current = false;
    setIsAnimating(true);
    setCurrentStep(0);

    for (let i = 0; i < actions.length; i++) {
      if (abortRef.current) break;

      const action = actions[i];
      setCurrentStep(i + 1);

      const shapeId = createShapeId(action.id || `anim_${Date.now()}_${i}`);

      try {
        switch (action.type) {
          // 1. Text & Headings
          case 'write_text': {
            editor.createShape({
              id: shapeId,
              type: 'text',
              x: action.x,
              y: action.y,
              props: {
                richText: toRichText(action.text || ''),
                color: action.color || 'black',
                size: action.size || 'm',
                scale: 1,
                autoSize: true,
              },
            });
            break;
          }

          // 2. Boxes & Containers
          case 'create_box': {
            editor.createShape({
              id: shapeId,
              type: 'geo',
              x: action.x,
              y: action.y,
              props: {
                geo: action.geo || 'rectangle',
                w: action.w || 240,
                h: action.h || 100,
                color: action.color || 'black',
                fill: action.fill || 'semi',
                dash: action.dash || 'draw',
                size: action.size || 's',
                richText: toRichText(action.text || ''),
              },
            });
            break;
          }

          // 3. Directional Process Arrows (Clean plain coordinate objects: { x, y })
          case 'draw_arrow': {
            const startX = action.fromX || 0;
            const startY = action.fromY || 0;
            const deltaX = (action.toX !== undefined ? action.toX : startX + 80) - startX;
            const deltaY = (action.toY !== undefined ? action.toY : startY) - startY;

            editor.createShape({
              id: shapeId,
              type: 'arrow',
              x: startX,
              y: startY,
              props: {
                start: { x: 0, y: 0 },
                end: { x: deltaX, y: deltaY },
                color: action.color || 'black',
                size: action.size || 'm',
                dash: action.dash || 'draw',
                arrowheadEnd: 'arrow',
              },
            });
            break;
          }

          // 4. Notes
          case 'create_note': {
            editor.createShape({
              id: shapeId,
              type: 'note',
              x: action.x,
              y: action.y,
              props: {
                color: action.color || 'yellow',
                size: action.size || 's',
                richText: toRichText(action.text || ''),
                scale: 1,
              },
            });
            break;
          }

          default:
            console.warn('Unhandled action:', action.type);
        }
      } catch (err) {
        console.error('Shape creation error:', err);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    setIsAnimating(false);
  }, [editor]);

  return { runSequence, stopAnimation, isAnimating, currentStep };
}