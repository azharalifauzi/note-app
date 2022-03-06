import {
  Box,
  BoxProps,
  Flex,
  Select,
  chakra,
  ChakraProvider
} from '@chakra-ui/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { produce } from 'immer';
import { renderToString } from 'react-dom/server';

type Block = {
  type: 'heading' | 'subheading' | 'body' | 'circle-list';
  content: string;
  style?: string[];
};

const BlockParser: React.FC<Block> = ({ type, content, style = [] }) => {
  const boxProps: BoxProps = {};

  if (type === 'heading') {
    boxProps.fontSize = 'xl';
  }

  if (type === 'subheading') {
    boxProps.fontSize = 'lg';
  }

  if (type === 'circle-list') {
    boxProps.listStyleType = 'circle';
    boxProps.as = 'li';
  }

  if (style.includes('italic')) {
    boxProps.fontStyle = 'italic';
  }

  if (style.includes('underline')) {
    boxProps.textDecoration = 'underline';
  }

  if (style.includes('bold')) {
    boxProps.fontWeight = 'bold';
  }

  const realContent = () => {
    if (content[content.length - 1] === ' ') {
      return `${content}&nbsp;`;
    }

    if (content === '') {
      return '<br />';
    }

    return content;
  };

  return (
    <Box
      {...boxProps}
      dangerouslySetInnerHTML={{
        __html: realContent()
      }}
    ></Box>
  );
};

function App() {
  const [index, setIndex] = useState<number>(0);
  const [endIndex, setEndIndex] = useState<number>(0);
  const [startOffset, setStartOffset] = useState<number>(0);
  const [endOffset, setEndOffset] = useState<number>(0);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [editEvent, setEditEvent] = useState<
    'enter' | 'type' | 'delete-backward' | 'delete-forward' | 'modify-style'
  >('type');
  const [
    contentLengthBeforeMoveToPrevSibling,
    setContentLengthBeforeMoveToPrevSibling
  ] = useState<number>(0);
  const noteRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    try {
      const selection = window.getSelection();
      const node = noteRef.current?.childNodes[index]?.childNodes[0];
      const nextNode = noteRef.current?.childNodes[index + 1];
      const prevNode = noteRef.current?.childNodes[index - 1]?.childNodes[0];

      if (selection && prevNode && editEvent === 'delete-backward') {
        if (startOffset <= 1) {
          selection.setPosition(
            prevNode,
            (prevNode.nodeValue?.length ?? 0) -
              contentLengthBeforeMoveToPrevSibling
          );
        }
      }

      if (selection && node) {
        switch (editEvent) {
          case 'type':
            selection.setPosition(node, startOffset + 1);
            break;
          case 'modify-style':
          case 'delete-forward':
            selection.setPosition(node, startOffset);
            break;
          case 'delete-backward':
            selection.setPosition(node, startOffset - 1);
            break;
          case 'enter':
            if (nextNode) selection.setPosition(nextNode, 0);
            break;
          default:
            break;
        }
      }

      setEditEvent('type');
    } catch (error) {}
  }, [blocks]);

  function findCaretPosition(node: Node, nodePosition: number = 0): number {
    // findParent
    if (node.parentElement?.id === 'note') {
      const prevSibling = node.previousSibling;

      if (prevSibling) {
        return findCaretPosition(prevSibling, nodePosition + 1);
      }

      return nodePosition;
    }

    const parentNode = node.parentNode;

    if (parentNode) {
      return findCaretPosition(parentNode);
    }

    return nodePosition;
  }

  function getPosition() {
    const select = window.getSelection();

    if (select && select.anchorNode) {
      const position = findCaretPosition(select.anchorNode);
      setStartOffset(select.anchorOffset);
      setIndex(position);
    }

    if (select && select.focusNode) {
      const endPosition = findCaretPosition(select.focusNode);
      setEndOffset(select.focusOffset);
      setEndIndex(endPosition);
    }
  }

  const handleBeforeInput: React.FormEventHandler = (e) => {
    // @ts-ignore
    let data = e.data;
    e.preventDefault();
    const selection = window.getSelection();
    const isEnter = data === '\n' || data === '\r';

    if (selection && selection.anchorNode) {
      let position = findCaretPosition(selection.anchorNode);
      let offset = selection.anchorOffset;
      // const { textContent } = e.currentTarget.childNodes[position];
      const childNodesLength = noteRef.current?.childNodes.length;

      if (isEnter) {
        setEditEvent('enter');
        position++;
        offset = -1;
      } else {
        setEditEvent('type');
      }

      const newBlocks = produce(blocks, (draft) => {
        if (isEnter) {
          if (!draft[position - 1]) {
            draft[position - 1] = { type: 'body', content: '' };
          }

          const currentContent = draft[position - 1].content;

          let newContent = currentContent.substring(selection.anchorOffset);

          if (!newContent) {
            newContent = '';
          }

          draft[position - 1].content =
            currentContent.substring(0, selection.anchorOffset) || '';

          draft.splice(position, 0, {
            type: 'body',
            content: newContent
          });

          return;
        }

        if (!draft[position]) {
          draft[position] = {
            type: 'body',
            content: ''
          };
        }
        const currentContent = draft[position].content;

        const newContent =
          currentContent.substring(0, offset) +
          data +
          currentContent.substring(offset);

        draft[position].content = newContent;

        // delete unused block
        // if (childNodesLength) {
        //   draft.splice(childNodesLength, draft.length - childNodesLength);
        // }
      });

      setBlocks(newBlocks);
    }
  };

  const handleChange: React.ChangeEventHandler<HTMLSelectElement> = (e) => {
    const { value } = e.target;
    setEditEvent('modify-style');
    setBlocks(
      produce(blocks, (draft) => {
        draft[index].type = value as Block['type'];
      })
    );

    noteRef.current?.focus();
  };

  const handleDelete: React.FormEventHandler<HTMLDivElement> = (e) => {
    const selection = window.getSelection();
    const { inputType } = e.nativeEvent;
    const isDeleteForward = inputType === 'deleteContentForward';
    const isDeleteBackward = inputType === 'deleteContentBackward';

    if (isDeleteForward) {
      setEditEvent('delete-forward');
    }

    if (isDeleteBackward) {
      setEditEvent('delete-backward');
    }

    if (selection && selection.anchorNode) {
      const position = findCaretPosition(selection.anchorNode);
      const offset = selection.anchorOffset;

      const newBlocks = produce(blocks, (draft) => {
        if (startOffset === 0 && index > 0) {
          const { content } = draft[index];

          if (content === '' && isDeleteBackward) {
            setContentLengthBeforeMoveToPrevSibling(0);
            draft.splice(index, 1);
            return;
          }

          if (isDeleteBackward && content) {
            const { content: prevSiblingContent } = draft[index - 1];
            draft[index - 1].content = prevSiblingContent + content;
            setContentLengthBeforeMoveToPrevSibling(content.length);
            draft.splice(index, 1);
            return;
          }
        }

        if (startOffset === draft[index].content.length) {
          const { content } = draft[index];

          if (isDeleteForward) {
            if (draft[index + 1]) {
              const { content: nextSiblingContent } = draft[index + 1];
              draft[index].content = content + nextSiblingContent;
              draft.splice(index + 1, 1);
              return;
            }
          }
        }

        const { content } = draft[position];
        const contentToArray = content.split('');
        contentToArray.splice(offset, 1);
        draft[position].content = contentToArray.join('');
      });
      setBlocks(newBlocks);
    }
  };

  return (
    <>
      <Flex alignItems="center" px="6" py="4" gap="6">
        <Select
          onChange={handleChange}
          maxW="400px"
          value={blocks[index]?.type}
        >
          <option value="heading">Heading</option>
          <option value="subheading">Sub Heading</option>
          <option value="body">Body</option>
          <option value="circle-list">- Circle List</option>
        </Select>
        <chakra.button w="8" h="8" border="1px solid black">
          B
        </chakra.button>
        <chakra.button w="8" h="8" border="1px solid black">
          I
        </chakra.button>
        <chakra.button w="8" h="8" border="1px solid black">
          U
        </chakra.button>
      </Flex>
      <Box
        h="80vh"
        p="10"
        contentEditable
        suppressContentEditableWarning
        onBeforeInput={handleBeforeInput}
        onInput={handleDelete}
        onKeyUp={getPosition}
        onSelect={getPosition}
        ref={noteRef}
        _focus={{ outline: 'none' }}
        id="note"
        dangerouslySetInnerHTML={{
          __html: renderToString(
            <ChakraProvider>
              {blocks.map((props, i) => (
                <BlockParser key={`block-${props.content}-${i}`} {...props} />
              ))}
            </ChakraProvider>
          )
        }}
      ></Box>
      <div>index: {index}</div>
      <div>end Index: {endIndex}</div>
      <div>start offset: {startOffset}</div>
      <div>end offset: {endOffset}</div>
    </>
  );
}

export default App;
