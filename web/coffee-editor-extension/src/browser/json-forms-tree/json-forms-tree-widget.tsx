/*!
 * Copyright (C) 2019 EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 */
import { Emitter } from '@theia/core';
import { ConfirmDialog, ExpandableTreeNode, TreeModel } from '@theia/core/lib/browser';
import { ContextMenuRenderer } from '@theia/core/lib/browser/context-menu-renderer';
import { TreeNode } from '@theia/core/lib/browser/tree/tree';
import { NodeProps, TreeProps, TreeWidget } from '@theia/core/lib/browser/tree/tree-widget';
import { inject, injectable, postConstruct } from 'inversify';
import * as React from 'react';
import { v4 } from 'uuid';

import { JsonFormsTree } from './json-forms-tree';
import { JsonFormsTreeAnchor, JsonFormsTreeContextMenu } from './json-forms-tree-container';
import { JsonFormsTreeLabelProvider } from './json-forms-tree-label-provider';

@injectable()
export class JsonFormsTreeWidget extends TreeWidget {
  protected onTreeWidgetSelectionEmitter = new Emitter<
    readonly Readonly<JsonFormsTree.Node>[]
  >();
  protected data: JsonFormsTree.TreeData;

  constructor(
    @inject(TreeProps) readonly props: TreeProps,
    @inject(TreeModel) readonly model: TreeModel,
    @inject(ContextMenuRenderer) readonly contextMenuRenderer: ContextMenuRenderer,
    @inject(JsonFormsTreeLabelProvider) readonly labelProvider: JsonFormsTreeLabelProvider,
    @inject(JsonFormsTree.NodeFactory) protected readonly nodeFactory: JsonFormsTree.NodeFactory
  ) {
    super(props, model, contextMenuRenderer);
    this.id = JsonFormsTreeWidget.WIDGET_ID;
    this.title.label = JsonFormsTreeWidget.WIDGET_LABEL;
    this.title.caption = JsonFormsTreeWidget.WIDGET_LABEL;
    this.addClass(JsonFormsTreeWidget.Styles.JSONFORMS_TREE_CLASS);

    model.root = {
      id: JsonFormsTreeWidget.WIDGET_ID,
      name: JsonFormsTreeWidget.WIDGET_LABEL,
      parent: undefined,
      visible: false,
      children: []
    } as JsonFormsTree.RootNode;
  }

  @postConstruct()
  protected init() {
    super.init();

    this.addClass('tree-container');

    this.toDispose.push(this.onTreeWidgetSelectionEmitter);
    this.toDispose.push(
      this.model.onSelectionChanged(e => {
        this.onTreeWidgetSelectionEmitter.fire(e as readonly Readonly<
          JsonFormsTree.Node
        >[]);
      })
    );
  }

  /** Overrides method in TreeWidget */
  protected handleClickEvent(
    node: TreeNode | undefined,
    event: React.MouseEvent<HTMLElement>
  ): void {
    const x = event.target as HTMLElement;
    if (x.classList.contains('node-button')) {
      // Don't do anything because the event is handled in the button's handler
      return;
    }
    super.handleClickEvent(node, event);
  }

  /*
   * Overrides TreeWidget.renderTailDecorations
   * Add a add child and a remove button.
   */
  protected renderTailDecorations(
    node: TreeNode,
    props: NodeProps
  ): React.ReactNode {
    const deco = super.renderTailDecorations(node, props);
    if (!JsonFormsTree.Node.is(node)) {
      return deco;
    }

    const addPlus = this.nodeFactory.hasCreatableChildren(node);
    return (
      <React.Fragment>
        {deco}
        <div className='node-buttons'>
          {addPlus ? (
            <div
              className='node-button far fa-plus-square'
              onClick={this.createAddHandler(node)}
            />
          ) : (
              ''
            )}
          <div
            className='node-button far fa-minus-square'
            onClickCapture={this.createRemoveHandler(node)}
          />
        </div>
      </React.Fragment>
    );
  }

  /**
   * Creates a handler for the delete button of a tree node.
   * @param node The tree node to create a remove handler for
   */
  private createRemoveHandler(node: JsonFormsTree.Node): (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void {
    return event => {
      event.stopPropagation();
      const dialog = new ConfirmDialog({
        title: 'Delete Node?',
        msg: 'Are you sure you want to delete the selected node?'
      });
      dialog.open().then(remove => {
        if (remove && node.parent && node.parent && JsonFormsTree.Node.is(node.parent)) {
          const prop = node.jsonforms.property;
          console.log('Remove node ' + node.name + ' from parent property ' + prop);
          if (node.jsonforms.index) {
            // multi ref
            // create remove command
          } else {
            // create remove command
          }

          // TODO send command to model server
        }
      });
    };
  }

  private createAddHandler(node: JsonFormsTree.Node): (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void {
    return event => {
      const treeAnchor: JsonFormsTreeAnchor = {
        x: event.nativeEvent.x,
        y: event.nativeEvent.y,
        node: node
      };
      this.contextMenuRenderer.render(JsonFormsTreeContextMenu.ADD_MENU, treeAnchor);
    };
  }

  public async setData(data: any) {
    this.data = data;
    await this.refreshModelChildren();
  }

  public selectFirst(): void {
    if (
      this.model.root &&
      JsonFormsTree.RootNode.is(this.model.root) &&
      this.model.root.children.length > 0 &&
      JsonFormsTree.Node.is(this.model.root.children[0])
    ) {
      this.model.selectNode(this.model.root.children[0] as JsonFormsTree.Node);
      this.model.refresh();
    }
  }

  public select(paths: string[]): void {
    if (paths.length === 0) {
      return;
    }
    const rootNode = this.model.root as JsonFormsTree.Node;
    const toSelect = paths.reduceRight((node, path) => node.children.find(value => value.name === path), rootNode) as JsonFormsTree.Node;
    this.model.selectNode(toSelect);
    this.model.refresh();
  }

  get onSelectionChange(): import('@theia/core').Event<
    readonly Readonly<JsonFormsTree.Node>[]
    > {
    return this.onTreeWidgetSelectionEmitter.event;
  }

  protected async refreshModelChildren(): Promise<void> {
    if (this.model.root && JsonFormsTree.RootNode.is(this.model.root)) {
      const newTree =
        !this.data || this.data.error ? [] : this.nodeFactory.mapDataToNodes(this.data);
      this.model.root.children = newTree;
      this.model.refresh();
    }
  }

  protected defaultNode(): Pick<
    JsonFormsTree.Node,
    'id' | 'expanded' | 'selected' | 'parent' | 'decorationData' | 'children'
  > {
    return {
      id: v4(),
      expanded: false,
      selected: false,
      parent: undefined,
      decorationData: {},
      children: []
    };
  }


  protected isExpandable(node: TreeNode): node is ExpandableTreeNode {
    return JsonFormsTree.Node.is(node) && node.children.length > 0;
  }

  protected renderIcon(node: TreeNode): React.ReactNode {
    return (
      <div className='tree-icon-container'>
        <div className={this.labelProvider.getIconClass(node)} />
      </div>
    );
  }

  /**
   * Updates the data of the given node with the new data. Refreshes the tree if necessary.
   * Note that this method will only work properly if only data relevant for this node was changed.
   * If data of the subtree was changed too please call updateDataForSubtree instead.
   */
  public updateDataForNode(node: JsonFormsTree.Node, data: any) {
    Object.assign(node.jsonforms.data, data);
    const newName = this.labelProvider.getName(data);
    if (node.name !== newName) {
      node.name = newName;
      this.model.refresh();
    }
  }

  /**
   * Updates the data of the given node and recreates its whole subtree. Refreshes the tree.
   */
  public updateDataForSubtree(node: JsonFormsTree.Node, data: any) {
    Object.assign(node.jsonforms.data, data);
    const newNode = this.nodeFactory.mapData(data);
    node.name = newNode.name;
    node.children = newNode.children;
    this.model.refresh();
  }
}

export namespace JsonFormsTreeWidget {
  export const WIDGET_ID = 'json-forms-tree';
  export const WIDGET_LABEL = 'JSONForms Tree';

  /**
   * CSS styles for the `JSONForms Hierarchy` widget.
   */
  export namespace Styles {
    export const JSONFORMS_TREE_CLASS = 'json-forms-tree';
  }
}
