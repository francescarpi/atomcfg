# Your init script
#
# Atom will evaluate this file each time a new window is opened. It is run
# after packages are loaded/activated and after the previous editor state
# has been restored.
#
# An example hack to log to the console when each text editor is saved.
#
# atom.workspace.observeTextEditors (editor) ->
#   editor.onDidSave ->
#     console.log "Saved! #{editor.getPath()}"

# New action for toggle unfold. It can be mapped with ctrl-space
atom.commands.add 'atom-text-editor', 'editor:toggle-current-row-folding': (event) ->
    editor = @getModel()
    bufferRow = editor.bufferPositionForScreenPosition(editor.getCursorScreenPosition()).row
    if editor.isFoldedAtBufferRow(bufferRow)
      editor.unfoldBufferRow(bufferRow)
    else
      editor.foldBufferRow(bufferRow)


# Fold automatically for some file types.
# atom.workspace.observeTextEditors (editor) ->
#   name = editor.getGrammar().name
#   if name is 'JavaScript (JSX)' or name is 'Less' or name is 'Python'
#     editor.foldAll()

# New action for save and exit of insert mode for vim-mode-plus
atom.commands.add 'atom-text-editor', 'editor:save-and-exit-of-insert-mode': (event) ->
  editor = @getModel()
  atom.commands.dispatch(atom.views.getView(editor), 'vim-mode-plus:reset-normal-mode')
  atom.commands.dispatch(atom.views.getView(editor), 'core:save')

# New action for toggle comment and exit from vim visual mode
atom.commands.add 'atom-text-editor', 'editor:toggle-comment-exit-visual-mode': (event) ->
  editor = @getModel()
  atom.commands.dispatch(atom.views.getView(editor), 'editor:toggle-line-comments')
  atom.commands.dispatch(atom.views.getView(editor), 'vim-mode-plus:reset-normal-mode')
