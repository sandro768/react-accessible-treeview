import cx from "classnames";
import PropTypes from "prop-types";
import React, { useEffect, useReducer, useRef } from "react";
import {
  ITreeViewState,
  treeReducer,
  treeTypes,
  TreeViewAction,
} from "./reducer";
import {
  ClickActions,
  INode,
  INodeRefs,
  INodeRendererProps,
  NodeAction,
  NodeId,
  TreeViewData,
} from "./types";
import {
  difference,
  focusRef,
  getAccessibleRange,
  getDescendants,
  getLastAccessible,
  getNextAccessible,
  getParent,
  getPreviousAccessible,
  isBranchNode,
  onComponentBlur,
  propagatedIds,
  propagateSelectChange,
  scrollToRef,
  symmetricDifference,
  usePrevious,
  usePreviousData,
  isBranchSelectedAndHasSelectedDescendants,
  getTreeParent,
  getTreeNode,
  validateTreeViewData,
  noop,
} from "./utils";
import { Node } from "./node";
import {
  baseClassNames,
  clickActions,
  CLICK_ACTIONS,
  NODE_ACTIONS,
} from "./constants";

interface IUseTreeProps {
  data: TreeViewData;
  controlledIds?: NodeId[];
  controlledExpandedIds?: NodeId[];
  defaultExpandedIds?: NodeId[];
  defaultSelectedIds?: NodeId[];
  defaultDisabledIds?: NodeId[];
  nodeRefs: INodeRefs;
  leafRefs: INodeRefs;
  onSelect?: (props: ITreeViewOnSelectProps) => void;
  onExpand?: (props: ITreeViewOnExpandProps) => void;
  multiSelect?: boolean;
  propagateSelectUpwards?: boolean;
  propagateSelect?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onLoadData?: (props: ITreeViewOnLoadDataProps) => Promise<any>;
  togglableSelect?: boolean;
}

const useTree = ({
  data,
  controlledIds,
  controlledExpandedIds,
  defaultExpandedIds,
  defaultSelectedIds,
  defaultDisabledIds,
  nodeRefs,
  leafRefs,
  onSelect,
  onExpand,
  onLoadData,
  togglableSelect,
  multiSelect,
  propagateSelect,
  propagateSelectUpwards,
}: IUseTreeProps) => {
  const treeParentNode = getTreeParent(data);
  const [state, dispatch] = useReducer(treeReducer, {
    selectedIds: new Set<NodeId>(controlledIds || defaultSelectedIds),
    tabbableId: treeParentNode.children[0],
    isFocused: false,
    expandedIds: new Set<NodeId>(controlledExpandedIds || defaultExpandedIds),
    halfSelectedIds: new Set<NodeId>(),
    lastUserSelect: treeParentNode.children[0],
    lastInteractedWith: null,
    disabledIds: new Set<NodeId>(defaultDisabledIds),
  });

  const {
    selectedIds,
    expandedIds,
    disabledIds,
    tabbableId,
    halfSelectedIds,
    lastAction,
    lastInteractedWith,
  } = state;
  const prevSelectedIds = usePrevious(selectedIds) || new Set<number>();
  const toggledIds = symmetricDifference(selectedIds, prevSelectedIds);

  useEffect(() => {
    if (onSelect != null && onSelect !== noop) {
      for (const toggledId of toggledIds) {
        const isBranch =
          isBranchNode(data, toggledId) ||
          !!getTreeNode(data, tabbableId)?.isBranch;
        onSelect({
          element: getTreeNode(data, toggledId),
          isBranch: isBranch,
          isExpanded: isBranch ? expandedIds.has(toggledId) : false,
          isSelected: selectedIds.has(toggledId),
          isDisabled: disabledIds.has(toggledId),
          isHalfSelected: isBranch ? halfSelectedIds.has(toggledId) : false,
          treeState: state,
        });
      }
    }
  }, [
    data,
    selectedIds,
    expandedIds,
    disabledIds,
    halfSelectedIds,
    toggledIds,
    onSelect,
    state,
  ]);

  const prevExpandedIds = usePrevious(expandedIds) || new Set<number>();
  useEffect(() => {
    const toggledExpandIds = symmetricDifference(expandedIds, prevExpandedIds);
    if (onExpand != null && onExpand !== noop) {
      for (const id of toggledExpandIds) {
        onExpand({
          element: getTreeNode(data, id),
          isExpanded: expandedIds.has(id),
          isSelected: selectedIds.has(id),
          isDisabled: disabledIds.has(id),
          isHalfSelected: halfSelectedIds.has(id),
          treeState: state,
        });
      }
    }
  }, [
    data,
    selectedIds,
    expandedIds,
    disabledIds,
    halfSelectedIds,
    prevExpandedIds,
    onExpand,
    state,
  ]);

  const prevData = usePreviousData(data) || new Map<NodeId, INode>();
  useEffect(() => {
    const toggledExpandIds = symmetricDifference(expandedIds, prevExpandedIds);
    if (onLoadData) {
      for (const id of toggledExpandIds) {
        onLoadData({
          element: getTreeNode(data, id),
          isExpanded: expandedIds.has(id),
          isSelected: selectedIds.has(id),
          isDisabled: disabledIds.has(id),
          isHalfSelected: halfSelectedIds.has(id),
          treeState: state,
        });
      }
      if (prevData !== data && togglableSelect && propagateSelect) {
        for (const id of expandedIds) {
          selectedIds.has(id) &&
            dispatch({
              type: treeTypes.changeSelectMany,
              ids: propagatedIds(data, [id], disabledIds),
              select: true,
              multiSelect,
              lastInteractedWith: id,
            });
        }
      }
    }
  }, [
    data,
    selectedIds,
    expandedIds,
    disabledIds,
    halfSelectedIds,
    prevExpandedIds,
    onLoadData,
    state,
  ]);

  useEffect(() => {
    const toggleControlledIds = new Set<NodeId>(controlledIds);
    //nodes need to be selected
    const diffSelectedIds = difference(toggleControlledIds, prevSelectedIds);
    //nodes to be deselected
    const diffDeselectedIds = difference(prevSelectedIds, toggleControlledIds);

    //controlled deselection
    if (diffDeselectedIds.size) {
      for (const toggleDeselectedId of diffDeselectedIds) {
        dispatch({
          type: treeTypes.deselect,
          id: toggleDeselectedId,
          multiSelect,
          controlled: true,
          lastInteractedWith: toggleDeselectedId,
        });
      }
    }

    //controlled selection
    if (diffSelectedIds.size) {
      for (const toggleSelectedId of diffSelectedIds) {
        dispatch({
          type: treeTypes.select,
          id: toggleSelectedId,
          multiSelect,
          controlled: true,
          lastInteractedWith: toggleSelectedId,
        });
        propagateSelect &&
          !disabledIds.has(toggleSelectedId) &&
          dispatch({
            type: treeTypes.changeSelectMany,
            ids: propagatedIds(data, [toggleSelectedId], disabledIds),
            select: true,
            multiSelect,
            lastInteractedWith: toggleSelectedId,
          });
      }
    }
  }, [controlledIds]);

  useEffect(() => {
    const toggleControlledExpandedIds = new Set<NodeId>(controlledExpandedIds);
    //nodes need to be expanded
    const diffExpandedIds = difference(
      toggleControlledExpandedIds,
      prevExpandedIds
    );
    //nodes to be collapsed
    const diffCollapseIds = difference(
      prevExpandedIds,
      toggleControlledExpandedIds
    );
    //controlled collapsing
    if (diffCollapseIds.size) {
      for (const id of diffCollapseIds) {
        if (isBranchNode(data, id) || getTreeNode(data, id).isBranch) {
          const ids = [id, ...getDescendants(data, id, new Set<number>())];
          dispatch({
            type: treeTypes.collapseMany,
            ids: ids,
            lastInteractedWith: id,
          });
        }
      }
    }
    //controlled expanding
    if (diffExpandedIds.size) {
      for (const id of diffExpandedIds) {
        if (isBranchNode(data, id) || getTreeNode(data, id).isBranch) {
          const parentId = getParent(data, id);
          if (parentId) {
            dispatch({
              type: treeTypes.expandMany,
              ids: [id, parentId],
              lastInteractedWith: id,
            });
          } else {
            dispatch({
              type: treeTypes.expand,
              id: id,
              lastInteractedWith: id,
            });
          }
        }
      }
    }
  }, [controlledExpandedIds]);

  //Update parent if a child changes
  useEffect(() => {
    if (propagateSelectUpwards) {
      const idsToUpdate = new Set<NodeId>(toggledIds);
      if (
        lastInteractedWith &&
        lastAction !== treeTypes.focus &&
        lastAction !== treeTypes.collapse &&
        lastAction !== treeTypes.expand &&
        lastAction !== treeTypes.toggle
      ) {
        idsToUpdate.add(lastInteractedWith);
      }
      const { every, some, none } = propagateSelectChange(
        data,
        idsToUpdate,
        selectedIds,
        disabledIds,
        halfSelectedIds,
        multiSelect
      );
      for (const id of every) {
        if (!selectedIds.has(id)) {
          dispatch({
            type: treeTypes.select,
            id,
            multiSelect,
            keepFocus: true,
            NotUserAction: true,
            lastInteractedWith,
          });
        }
      }
      for (const id of some) {
        if (!halfSelectedIds.has(id))
          dispatch({
            type: treeTypes.halfSelect,
            id,
            lastInteractedWith,
          });
      }
      for (const id of none) {
        if (selectedIds.has(id) || halfSelectedIds.has(id))
          dispatch({
            type: treeTypes.deselect,
            id,
            multiSelect,
            keepFocus: true,
            NotUserAction: true,
            lastInteractedWith,
          });
      }
    }
  }, [
    data,
    multiSelect,
    propagateSelectUpwards,
    selectedIds,
    expandedIds,
    disabledIds,
    halfSelectedIds,
    lastAction,
    prevSelectedIds,
    toggledIds,
    lastInteractedWith,
  ]);

  //Focus
  useEffect(() => {
    if (lastInteractedWith == null) return;
    else if (
      tabbableId != null &&
      nodeRefs?.current != null &&
      leafRefs?.current != null
    ) {
      const tabbableNode = nodeRefs.current[tabbableId];
      const leafNode = leafRefs.current[lastInteractedWith];
      scrollToRef(leafNode);
      focusRef(tabbableNode);
    }
  }, [tabbableId, nodeRefs, leafRefs, lastInteractedWith]);

  // The "as const" technique tells Typescript that this is a tuple not an array
  return [state, dispatch] as const;
};

export interface ITreeViewOnSelectProps {
  element: INode;
  isBranch: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  isHalfSelected: boolean;
  isDisabled: boolean;
  treeState: ITreeViewState;
}

export interface ITreeViewOnExpandProps {
  element: INode;
  isExpanded: boolean;
  isSelected: boolean;
  isHalfSelected: boolean;
  isDisabled: boolean;
  treeState: ITreeViewState;
}

export interface ITreeViewOnLoadDataProps {
  element: INode;
  isExpanded: boolean;
  isSelected: boolean;
  isHalfSelected: boolean;
  isDisabled: boolean;
  treeState: ITreeViewState;
}

export interface ITreeViewProps {
  /** Tree data*/
  data: TreeViewData;
  /** Function called when a node changes its selected state */
  onSelect?: (props: ITreeViewOnSelectProps) => void;
  /** Function called when a node changes its expanded state */
  onExpand?: (props: ITreeViewOnExpandProps) => void;
  /** Function called to load data asynchronously on expand */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onLoadData?: (props: ITreeViewOnLoadDataProps) => Promise<any>;
  /** className to add to the outermost ul */
  className?: string;
  /** Render prop for the node */
  nodeRenderer: (props: INodeRendererProps) => React.ReactNode;
  /** Indicates what action will be performed on a node which informs the correct aria-* properties to use on the node (aria-checked if using checkboxes, aria-selected if not). */
  nodeAction?: NodeAction;
  /** Array with the ids of the default expanded nodes */
  defaultExpandedIds?: NodeId[];
  /** Array with the ids of the default selected nodes */
  defaultSelectedIds?: NodeId[];
  /** Array with the ids of controlled expanded nodes */
  expandedIds?: NodeId[];
  /** Array with the ids of controlled selected nodes */
  selectedIds?: NodeId[];
  /** Array with the ids of the default disabled nodes */
  defaultDisabledIds?: NodeId[];
  /** If true, collapsing a node will also collapse its descendants */
  propagateCollapse?: boolean;
  /** If true, selecting a node will also select its descendants */
  propagateSelect?: boolean;
  /** If true, selecting a node will update the state of its parent (e.g. a parent node in a checkbox will be automatically selected if all of its children are selected) */
  propagateSelectUpwards?: boolean;
  /** Allows multiple nodes to be selected */
  multiSelect?: boolean;
  /** Selecting a node with a keyboard (using Space or Enter) will also toggle its expanded state */
  expandOnKeyboardSelect?: boolean;
  /** Wether the selected state is togglable */
  togglableSelect?: boolean;
  /** action to perform on click */
  clickAction?: ClickActions;
  /** Custom onBlur event that is triggered when focusing out of the component as a whole (moving focus between the nodes won't trigger it) */
  onBlur?: (event: {
    treeState: ITreeViewState;
    dispatch: React.Dispatch<TreeViewAction>;
  }) => void;
}

const TreeView = React.forwardRef<HTMLUListElement, ITreeViewProps>(
  function TreeView(
    {
      data,
      selectedIds,
      nodeRenderer,
      onSelect = noop,
      onExpand = noop,
      onLoadData,
      className = "",
      multiSelect = false,
      propagateSelect = false,
      propagateSelectUpwards = false,
      propagateCollapse = false,
      expandOnKeyboardSelect = false,
      togglableSelect = false,
      defaultExpandedIds = [],
      defaultSelectedIds = [],
      defaultDisabledIds = [],
      clickAction = clickActions.select,
      nodeAction = "select",
      expandedIds,
      onBlur,
      ...other
    },
    ref
  ) {
    validateTreeViewData(data);
    const nodeRefs = useRef({});
    const leafRefs = useRef({});
    const [state, dispatch] = useTree({
      data,
      controlledIds: selectedIds,
      controlledExpandedIds: expandedIds,
      defaultExpandedIds,
      defaultSelectedIds,
      defaultDisabledIds,
      nodeRefs,
      leafRefs,
      onSelect,
      onExpand,
      onLoadData,
      togglableSelect,
      multiSelect,
      propagateSelect,
      propagateSelectUpwards,
    });
    propagateSelect = propagateSelect && multiSelect;

    let innerRef = useRef<HTMLUListElement | null>(null);
    if (ref != null) {
      innerRef = ref as React.MutableRefObject<HTMLUListElement>;
    }

    return (
      <ul
        className={cx(baseClassNames.root, className)}
        role="tree"
        aria-multiselectable={nodeAction === "select" ? multiSelect : undefined}
        ref={innerRef}
        onBlur={(event) => {
          onComponentBlur(event, innerRef.current, () => {
            onBlur &&
              onBlur({
                treeState: state,
                dispatch,
              });
            dispatch({ type: treeTypes.blur });
          });
        }}
        onKeyDown={handleKeyDown({
          data,
          tabbableId: state.tabbableId,
          expandedIds: state.expandedIds,
          selectedIds: state.selectedIds,
          disabledIds: state.disabledIds,
          halfSelectedIds: state.halfSelectedIds,
          clickAction,
          dispatch,
          propagateCollapse,
          propagateSelect,
          multiSelect,
          expandOnKeyboardSelect,
          togglableSelect,
        })}
        {...other}
      >
        {getTreeParent(data).children.map((x, index) => (
          <Node
            key={`${x}-${typeof x}`}
            data={data}
            element={getTreeNode(data, x)}
            setsize={getTreeParent(data).children.length}
            posinset={index + 1}
            level={1}
            {...state}
            state={state}
            dispatch={dispatch}
            nodeRefs={nodeRefs}
            leafRefs={leafRefs}
            baseClassNames={baseClassNames}
            nodeRenderer={nodeRenderer}
            propagateCollapse={propagateCollapse}
            propagateSelect={propagateSelect}
            propagateSelectUpwards={propagateSelectUpwards}
            multiSelect={multiSelect}
            togglableSelect={togglableSelect}
            clickAction={clickAction}
            nodeAction={nodeAction}
          />
        ))}
      </ul>
    );
  }
);

const handleKeyDown = ({
  data,
  expandedIds,
  selectedIds,
  disabledIds,
  tabbableId,
  dispatch,
  propagateCollapse,
  propagateSelect,
  multiSelect,
  expandOnKeyboardSelect,
  togglableSelect,
  clickAction,
}: {
  data: TreeViewData;
  tabbableId: NodeId;
  expandedIds: Set<NodeId>;
  selectedIds: Set<NodeId>;
  disabledIds: Set<NodeId>;
  halfSelectedIds: Set<NodeId>;
  dispatch: React.Dispatch<TreeViewAction>;
  propagateCollapse?: boolean;
  propagateSelect?: boolean;
  multiSelect?: boolean;
  expandOnKeyboardSelect?: boolean;
  togglableSelect?: boolean;
  clickAction: ClickActions;
}) => (event: React.KeyboardEvent) => {
  const element = getTreeNode(data, tabbableId);
  const id = element.id;
  if (event.ctrlKey) {
    if (event.key === "a") {
      event.preventDefault();
      const dataWithoutRoot = data.filter((x) => x.parent !== null);
      const ids = dataWithoutRoot
        .map((x) => x.id)
        .filter((id) => !disabledIds.has(id));
      dispatch({
        type: treeTypes.changeSelectMany,
        multiSelect,
        select:
          Array.from(selectedIds).filter((id) => !disabledIds.has(id))
            .length !== ids.length,
        ids,
        lastInteractedWith: element.id,
      });
    } else if (
      event.shiftKey &&
      (event.key === "Home" || event.key === "End")
    ) {
      const newId =
        event.key === "Home"
          ? getTreeParent(data).children[0]
          : getLastAccessible(data, id, expandedIds);
      const range = getAccessibleRange({
        data,
        expandedIds,
        from: id,
        to: newId,
      }).filter((id) => !disabledIds.has(id));
      dispatch({
        type: treeTypes.changeSelectMany,
        multiSelect,
        select: true,
        ids: propagateSelect ? propagatedIds(data, range, disabledIds) : range,
      });
      dispatch({
        type: treeTypes.focus,
        id: newId,
        lastInteractedWith: newId,
      });
    }
    return;
  }

  if (event.shiftKey) {
    switch (event.key) {
      case "ArrowUp": {
        event.preventDefault();
        const previous = getPreviousAccessible(data, id, expandedIds);
        if (previous != null && !disabledIds.has(previous)) {
          dispatch({
            type: treeTypes.changeSelectMany,
            ids: propagateSelect
              ? propagatedIds(data, [previous], disabledIds)
              : [previous],
            select: true,
            multiSelect,
            lastInteractedWith: previous,
          });
          dispatch({
            type: treeTypes.focus,
            id: previous,
            lastInteractedWith: previous,
          });
        }
        return;
      }
      case "ArrowDown": {
        event.preventDefault();
        const next = getNextAccessible(data, id, expandedIds);
        if (next != null && !disabledIds.has(next)) {
          dispatch({
            type: treeTypes.changeSelectMany,
            ids: propagateSelect
              ? propagatedIds(data, [next], disabledIds)
              : [next],
            multiSelect,
            select: true,
            lastInteractedWith: next,
          });
          dispatch({
            type: treeTypes.focus,
            id: next,
            lastInteractedWith: next,
          });
        }
        return;
      }
      default:
        break;
    }
  }
  switch (event.key) {
    case "ArrowDown": {
      event.preventDefault();
      const next = getNextAccessible(data, id, expandedIds);
      if (next != null) {
        dispatch({
          type: treeTypes.focus,
          id: next,
          lastInteractedWith: next,
        });
      }
      return;
    }
    case "ArrowUp": {
      event.preventDefault();
      const previous = getPreviousAccessible(data, id, expandedIds);
      if (previous != null) {
        dispatch({
          type: treeTypes.focus,
          id: previous,
          lastInteractedWith: previous,
        });
      }
      return;
    }
    case "ArrowLeft": {
      event.preventDefault();
      if (
        (isBranchNode(data, id) || element.isBranch) &&
        expandedIds.has(tabbableId)
      ) {
        if (propagateCollapse) {
          const ids = [id, ...getDescendants(data, id, new Set<number>())];
          dispatch({
            type: treeTypes.collapseMany,
            ids,
            lastInteractedWith: element.id,
          });
        } else {
          dispatch({
            type: treeTypes.collapse,
            id,
            lastInteractedWith: id,
          });
        }
      } else {
        const isRoot = getTreeParent(data).children.includes(id);
        if (!isRoot) {
          const parentId = getParent(data, id);
          if (parentId == null) {
            throw new Error("parentId of root element is null");
          }
          dispatch({
            type: treeTypes.focus,
            id: parentId,
            lastInteractedWith: parentId,
          });
        }
      }
      return;
    }
    case "ArrowRight": {
      event.preventDefault();
      if (isBranchNode(data, id) || element.isBranch) {
        if (expandedIds.has(tabbableId)) {
          dispatch({
            type: treeTypes.focus,
            id: element.children[0],
            lastInteractedWith: element.children[0],
          });
        } else {
          dispatch({ type: treeTypes.expand, id, lastInteractedWith: id });
        }
      }
      return;
    }
    case "Home":
      event.preventDefault();
      dispatch({
        type: treeTypes.focus,
        id: getTreeParent(data).children[0],
        lastInteractedWith: getTreeParent(data).children[0],
      });
      break;
    case "End": {
      event.preventDefault();
      const lastAccessible = getLastAccessible(
        data,
        getTreeParent(data).id,
        expandedIds
      );
      dispatch({
        type: treeTypes.focus,
        id: lastAccessible,
        lastInteractedWith: lastAccessible,
      });
      return;
    }
    case "*": {
      event.preventDefault();
      const parentId = getParent(data, id);
      if (parentId == null) {
        throw new Error("parentId of element is null");
      }
      const nodes = getTreeNode(data, parentId).children.filter(
        (x) => isBranchNode(data, x) || getTreeNode(data, x).isBranch
      );
      dispatch({
        type: treeTypes.expandMany,
        ids: nodes,
        lastInteractedWith: id,
      });
      return;
    }
    //IE11 uses "Spacebar"
    case "Enter":
    case " ":
    case "Spacebar":
      event.preventDefault();

      if (clickAction === clickActions.focus) {
        return;
      }

      const isSelectedAndHasSelectedDescendants = isBranchSelectedAndHasSelectedDescendants(
        data,
        element.id,
        selectedIds
      );

      dispatch({
        type: togglableSelect
          ? isSelectedAndHasSelectedDescendants
            ? treeTypes.halfSelect
            : treeTypes.toggleSelect
          : treeTypes.select,
        id: id,
        multiSelect,
        lastInteractedWith: id,
      });
      propagateSelect &&
        !disabledIds.has(element.id) &&
        dispatch({
          type: treeTypes.changeSelectMany,
          ids: propagatedIds(data, [id], disabledIds),
          select: togglableSelect ? !selectedIds.has(id) : true,
          multiSelect,
          lastInteractedWith: id,
        });
      expandOnKeyboardSelect &&
        dispatch({ type: treeTypes.toggle, id, lastInteractedWith: id });
      return;
    default:
      if (event.key.length === 1) {
        let currentId = getNextAccessible(data, id, expandedIds);
        while (currentId !== id) {
          if (currentId == null) {
            currentId = getTreeParent(data).children[0];
            continue;
          }
          if (
            getTreeNode(data, currentId).name[0].toLowerCase() ===
            event.key.toLowerCase()
          ) {
            dispatch({
              type: treeTypes.focus,
              id: currentId,
              lastInteractedWith: id,
            });
            return;
          }
          currentId = getNextAccessible(data, currentId, expandedIds);
        }
      }
      return;
  }
};

TreeView.propTypes = {
  /** Tree data*/
  data: PropTypes.array.isRequired,

  /** Function called when a node changes its selected state */
  onSelect: PropTypes.func,

  /** Function called when a node changes its expanded state */
  onExpand: PropTypes.func,

  /** className to add to the outermost ul*/
  className: PropTypes.string,

  /** Render prop for the node */
  nodeRenderer: PropTypes.func.isRequired,

  /** Array with the ids of the default expanded nodes*/
  defaultExpandedIds: PropTypes.array,

  /** Array with the ids of the default selected nodes*/
  defaultSelectedIds: PropTypes.array,

  /** Array with the ids of controlled expanded nodes */
  expandedIds: PropTypes.array,

  /** Array with the ids of controlled selected nodes */
  selectedIds: PropTypes.array,

  /** Array with the ids of the default disabled nodes*/
  defaultDisabledIds: PropTypes.array,

  /** If true, collapsing a node will also collapse its descendants */
  propagateCollapse: PropTypes.bool,

  /** If true, selecting a node will also select its descendants */
  propagateSelect: PropTypes.bool,

  /** If true, selecting a node will update the state of its parent (e.g. a parent node in a checkbox
   * will be automatically selected if all of its children are selected)*/
  propagateSelectUpwards: PropTypes.bool,

  /** Allows multiple nodes to be selected */
  multiSelect: PropTypes.bool,

  /** Selecting a node with a keyboard (using Space or Enter) will also toggle its expanded state */
  expandOnKeyboardSelect: PropTypes.bool,

  /** Wether the selected state is togglable */
  togglableSelect: PropTypes.bool,

  /** Indicates what action will be performed on a node which informs the correct aria-*
   * properties to use on the node (aria-checked if using checkboxes, aria-selected if not). */
  nodeAction: PropTypes.oneOf(NODE_ACTIONS),

  /** action to perform on click */
  clickAction: PropTypes.oneOf(CLICK_ACTIONS),

  /** Custom onBlur event that is triggered when focusing out of the component
   * as a whole (moving focus between the nodes won't trigger it) */
  onBlur: PropTypes.func,

  /** Function called to load data asynchronously on expand */
  onLoadData: PropTypes.func,
};

export default TreeView;
