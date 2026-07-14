🔬 DEEP GAP ANALYSIS: TeleBos vs Telegram Web K (tweb)

Based on exhaustive exploration of both codebases, here is the complete implementation blueprint to make TeleBos identical to Telegram Web K, mapped directly to the reference source files in `tweb_reference/`.

---

## 📐 PART 1: ARCHITECTURAL DIFFERENCES

┌──────────────┬───────────────────────────────┬────────────────────────────┬────────────────────────────────────┐
│  Dimension   │       tweb (Reference)        │     TeleBos (Current)      │                Gap                 │
├──────────────┼───────────────────────────────┼────────────────────────────┼────────────────────────────────────┤
│              │ SolidJS (fine-grained         │                            │ Different paradigm — React can't   │
│ UI Framework │ reactivity)                   │ React 18 (Next.js 14)      │ match Solid's performance but CAN  │
│              │                               │                            │ match the UI visually              │
├──────────────┼───────────────────────────────┼────────────────────────────┼────────────────────────────────────┤
│ Rendering    │ Procedural DOM + JSX hybrid   │ Pure React JSX (single     │ Need to split into proper          │
│ Strategy     │ for heavy lists               │ 2361-line file)            │ component hierarchy                │
├──────────────┼───────────────────────────────┼────────────────────────────┼────────────────────────────────────┤
│ State        │ Event-driven (100+ event      │ Zustand (2 stores) + React │ Need more granular state + message │
│ Management   │ types via RootScope) + Solid  │  Query                     │  cache                             │
│              │ stores                        │                            │                                    │
├──────────────┼───────────────────────────────┼────────────────────────────┼────────────────────────────────────┤
│ Real-time    │ MTProto directly (binary      │                            │ Architecture stays: Telethon is    │
│ Protocol     │ protocol over WebSocket)      │ Telethon → WebSocket relay │ the right approach for             │
│              │                               │                            │ multi-account                      │
├──────────────┼───────────────────────────────┼────────────────────────────┼────────────────────────────────────┤
│              │ Sass (SCSS) with CSS custom   │                            │ Need full CSS variable theming +   │
│ CSS          │ properties + tgico font       │ Tailwind CSS + shadcn/ui   │ Telegram icon font                 │
│              │ (2000+ icons)                 │                            │                                    │
├──────────────┼───────────────────────────────┼────────────────────────────┼────────────────────────────────────┤
│ 3-Panel      │ #column-left + #column-center │ 2-panel layout with custom │ Need full 3-column layout with     │
│ Layout       │  + #column-right with         │  right drawer (absolute    │ transitions                        │
│              │ resizable columns             │ positioning)               │                                    │
└──────────────┴───────────────────────────────┴────────────────────────────┴────────────────────────────────────┘

---

## 📐 PART 2: FEATURE-BY-FEATURE GAP MATRIX

### CHAT LIST PANEL (Left Column)

#### 1. Folder Tabs
*   **tweb Implementation**: Horizontal FoldersTabs with unread badges, custom icons (Lottie), "All" default tab
*   **TeleBos Status**: ❌ Folder tabs exist in accounts page, not chats. Chat page has basic "Active/Archived" toggle
*   **Backend Needed?**: ✅ Need `GET /folders` with unread counts per folder
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/foldersTabs.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/foldersTabs.tsx) (UI Tabs render)
    *   [`tweb_reference/src/components/sidebarLeft/tabs/chatFolders.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/sidebarLeft/tabs/chatFolders.tsx) (State & Settings)
    *   [`tweb_reference/src/scss/partials/_foldersSidebar.scss`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/scss/partials/_foldersSidebar.scss) (Styles)

#### 2. Resizable Sidebar
*   **tweb Implementation**: User-drag handle, 360px default, 480px max
*   **TeleBos Status**: ❌ Fixed width
*   **Backend Needed?**: ❌ CSS only
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/movableElement.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/movableElement.ts) (Drag handling)
    *   [`tweb_reference/src/helpers/updateColumnWidths.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/helpers/updateColumnWidths.ts) (Width calculation updates)

#### 3. Chat Row Avatar
*   **tweb Implementation**: Colored gradient fallback per chat type, online dot overlay
*   **TeleBos Status**: ✅ Partial — photo loading + gradient, online dots from WS
*   **Backend Needed?**: ✅ Backend already sends online status
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/avatarNew.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/avatarNew.tsx) (Avatar element)
    *   [`tweb_reference/src/scss/partials/_avatar.scss`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/scss/partials/_avatar.scss) (Styles)

#### 4. Chat Row Context Menu
*   **tweb Implementation**: Right-click: archive, pin/unpin, mute/unmute, mark read/unread, leave/delete, folder management
*   **TeleBos Status**: ❌ Only hover buttons (archive/delete), no context menu
*   **Backend Needed?**: ✅ Need pin/mute endpoints
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/dialogsContextMenu.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/dialogsContextMenu.ts) (Context menu item logic)

#### 5. Chat Row Selection Mode
*   **tweb Implementation**: Multi-select with batch actions (archive, delete, mark read)
*   **TeleBos Status**: ✅ Implemented (batch archive/unarchive/delete)
*   **Backend Needed?**: ✅ Already have endpoints
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/selection.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/selection.ts) (Multi-select management)

#### 6. Pinned Chats Section
*   **tweb Implementation**: Pinned chats at top with separator, pin icon
*   **TeleBos Status**: ❌ No pinning
*   **Backend Needed?**: ✅ Need `POST chats/{id}/pin` & `unpin`
*   **tweb Source Code**:
    *   [`tweb_reference/src/scss/partials/_chatPinned.scss`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/scss/partials/_chatPinned.scss) (Separator & Pin styling)

#### 7. Mute Indicators
*   **tweb Implementation**: Mute icon on chat row
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ✅ Need mute state from Telegram
*   **tweb Source Code**:
    *   [`tweb_reference/src/scss/partials/_chatlist.scss`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/scss/partials/_chatlist.scss) (Row layouts & indicators)

#### 8. Draft Preview
*   **tweb Implementation**: Red "Draft:" prefix in last message preview
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ❌ Client-side from WS `dialog_draft`
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/input.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/input.ts) (Draft syncing)

#### 9. Archive Folder
*   **tweb Implementation**: Swipe to archive, pull to reveal, archive folder icon
*   **TeleBos Status**: ✅ Partial — archive/unarchive works, but no archive folder view
*   **Backend Needed?**: ✅ Need `GET chats` with `folder=1` (archived)
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/archiveDialog.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/archiveDialog.tsx) (Archive dialog container)
    *   [`tweb_reference/src/components/archiveDialogContextMenu.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/archiveDialogContextMenu.ts)

#### 10. Connection Status Bar
*   **tweb Implementation**: "Connecting..." / "Updating..." at top of sidebar
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ❌ Client-side only
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/connectionStatus.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/connectionStatus.ts) (Connectivity banner)

#### 11. Global Search Toggle
*   **tweb Implementation**: Search icon in sidebar header → expands search input
*   **TeleBos Status**: ❌ No search in chat page
*   **Backend Needed?**: ✅ Need `GET /chats/search` endpoint
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/appSearch.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/appSearch.ts) & [`appSearchSuper.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/appSearchSuper.ts) (Sidebar Search Input)

---

### MESSAGE PANE (Center Column)

#### 13. Virtual Scrolling
*   **tweb Implementation**: Custom Scrollable with sliced message arrays, IntersectionObserver for loading
*   **TeleBos Status**: ❌ Basic scroll with IntersectionObserver for load-more only. No virtual list
*   **Backend Needed?**: ❌ Frontend optimization
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/scrollable.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/scrollable.ts) (Scroll handling)
    *   [`tweb_reference/src/components/verticalVirtualList.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/verticalVirtualList.tsx) & [`deferredSortedVirtualList.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/deferredSortedVirtualList.tsx) (Virtual rendering)

#### 14. Message Grouping
*   **tweb Implementation**: 5-min grouping with `isGroupFirst`/`isGroupMiddle`/`isGroupLast` positioning
*   **TeleBos Status**: ✅ 5-min grouping already implemented
*   **Backend Needed?**: ❌
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/bubbleGroups.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/bubbleGroups.ts) (Grouping helper)

#### 15. Message Bubble Tails
*   **tweb Implementation**: SVG tails (`tail-out.svg`, `tail-in.svg`) per bubble position
*   **TeleBos Status**: ✅ Already implemented
*   **Backend Needed?**: ❌
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/bubbles.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/bubbles.ts) (Bubble shell & tail layout)
    *   [`tweb_reference/src/scss/partials/_chatBubble.scss`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/scss/partials/_chatBubble.scss) (Tail absolute alignment styling)

#### 16. Bubble Colors
*   **tweb Implementation**: `--message-background-color` (incoming), `--message-out-background-color` (outgoing) — themable
*   **TeleBos Status**: ⚠️ Hardcoded `#eeffde`/white
*   **Backend Needed?**: ❌ Make CSS-variable driven
*   **tweb Source Code**:
    *   [`tweb_reference/src/scss/partials/_chatBubble.scss`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/scss/partials/_chatBubble.scss) (Variables styling)
    *   [`tweb_reference/src/scss/partials/_themes.scss`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/scss/partials/_themes.scss)

#### 17. Service Messages
*   **tweb Implementation**: Join/leave/pin/group-created/etc with localized text + icons
*   **TeleBos Status**: ❌ Not rendered
*   **Backend Needed?**: ✅ Need service message data from backend
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/bubbles.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/bubbles.ts) (Service bubble generation logic)

#### 18. Message Reactions
*   **tweb Implementation**: ReactionsElement — custom HTMLElement with Lottie-animated reaction picker, paid (star) reactions, who-reacted list
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ✅ Need `POST reactions`, `GET reactions`, WS `messages_reactions`
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/reaction.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/reaction.ts), [`reactions.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/reactions.ts), [`reactionsMenu.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/reactionsMenu.ts)

#### 19. Message Replies
*   **tweb Implementation**: RepliesElement — stacked avatars + count, click navigates to original message
*   **TeleBos Status**: ✅ Partial — reply preview rendered, but clicking doesn't scroll
*   **Backend Needed?**: ❌ Client-side navigation
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/replies.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/replies.ts) (Replies display & scrolling handler)

#### 20. Message Forwarding
*   **tweb Implementation**: PopupForward — multi-peer selector, caption editing, remove-sender toggle, "Forwarded from" header
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ✅ Need `POST forward` endpoint
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/popups/forward.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/popups/forward.tsx) (Forward popup dialog)
    *   [`tweb_reference/src/components/sidebarRight/tabs/forward.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/sidebarRight/tabs/forward.ts) (Multi-forward selector)

#### 21. Message Editing
*   **tweb Implementation**: Edit message text inline, "edited" label with up/down edit history
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ✅ Need `PUT messages/{id}` endpoint
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/input.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/input.ts) (Inline edit action logic)

#### 22. Message Deletion
*   **tweb Implementation**: PopupDeleteMessages — confirmation, "Delete for me/everyone" options
*   **TeleBos Status**: ❌ Context menu has delete button but no mutation
*   **Backend Needed?**: ✅ Need `DELETE messages/{id}` endpoint
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/popups/deleteMessages.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/popups/deleteMessages.ts) & [`deleteMegagroupMessages.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/popups/deleteMegagroupMessages.tsx)

#### 23. Message Pinning
*   **tweb Implementation**: PopupPinMessage/PopupUnpinMessage + PinnedMessagePlate in topbar with counter, dismiss
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ✅ Need `POST pin`, `POST unpin`, pinned message in chat header
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/pinnedMessage.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/pinnedMessage.tsx) (Header plate + animations)
    *   [`tweb_reference/src/components/popups/unpinMessage.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/popups/unpinMessage.ts) (Confirmation Dialog)

#### 24. Message Selection Mode
*   **tweb Implementation**: Multi-select with forward/delete/reply actions bar
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ❌ Frontend only
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/selection.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/selection.ts) (State controller for multi-bubbles)

#### 25. Message Search
*   **tweb Implementation**: ChatSearch — search bar with filters (photos, videos, files, links, music, voice) + date jump + hashtag modes
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ✅ Need `GET messages/search` endpoint
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/search.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/search.ts) (In-chat filter panels)
    *   [`tweb_reference/src/components/chat/topbarSearch.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/topbarSearch.tsx)

#### 26. Jump-to-Date
*   **tweb Implementation**: CalendarSlice calendar picker to navigate to messages by date
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ✅ Need `GET messages/at-date` endpoint
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/popups/datePicker.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/popups/datePicker.tsx) (Custom Calendar date grid picker)

#### 27. Link Previews
*   **tweb Implementation**: URL cards with title, description, image, domain — rendered as RichMessageBubble
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ❌ Frontend parsing + Telegram already sends `webPage` data
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/getWebPageActionOnClick.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/getWebPageActionOnClick.ts) (Web preview click behaviors)

#### 28. Poll Rendering
*   **tweb Implementation**: PollElement — bar chart, percentages, voted indicator, quiz mode with correct answer reveal
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ✅ Need poll data in message schema
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/poll.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/poll.ts) (Bar percentage renderings)
    *   [`tweb_reference/src/scss/partials/_poll.scss`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/scss/partials/_poll.scss)

#### 29. Poll Creation UI
*   **tweb Implementation**: PopupPoll — question, options (add/remove), anonymous toggle, multiple choice, quiz mode
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ✅ Need `POST poll` endpoint
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/popups/createPoll/`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/popups/createPoll) (Popup options configurator)

#### 30. Scheduled Messages
*   **tweb Implementation**: Send-later via PopupScheduleSending calendar picker, PopupSendNow for editing scheduled
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ✅ Need `schedule_date` param on send, `GET scheduled`
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/popups/scheduleSendingPopup.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/popups/scheduleSendingPopup.tsx)
    *   [`tweb_reference/src/components/popups/sendNow.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/popups/sendNow.ts)

#### 31. Voice Message Recording
*   **tweb Implementation**: ChatRecording with NativeVoiceRecorder — waveform visualization, pause/resume/cancel, send
*   **TeleBos Status**: ❌ Waveform display exists but no recording
*   **Backend Needed?**: ❌ Frontend only (MediaRecorder API)
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/recording/`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/recording) & [`voiceRecording/`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/voiceRecording)
    *   [`tweb_reference/src/scss/partials/_voiceRecordingPanel.scss`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/scss/partials/_voiceRecordingPanel.scss)

#### 32. Voice Message Playback
*   **tweb Implementation**: Waveform with progress bar, speed control (1x/1.5x/2x), seek via waveform click
*   **TeleBos Status**: ⚠️ Basic — waveform bars + Audio element but no seek
*   **Backend Needed?**: ❌ Frontend enhancement
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/audio.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/audio.ts) (Audio state / waveform clicks)
    *   [`tweb_reference/src/components/chat/audio.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/audio.tsx)
    *   [`tweb_reference/src/scss/partials/_audio.scss`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/scss/partials/_audio.scss)

#### 33. Video Message (Round)
*   **tweb Implementation**: ChatRecording.videoRecorder — 60s max, progress ring, preview before send
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ❌ Frontend only
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/voiceRecording/`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/voiceRecording) (Round recording handling)

#### 34. GIF Picker
*   **tweb Implementation**: GifsTab — trending GIFs, search, saved GIFs, masonry layout, video playback
*   **TeleBos Status**: ❌ Only emoji grid
*   **Backend Needed?**: ⚠️ Need GIF search API (Tenor or Telegram API)
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/gifsMasonry.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/gifsMasonry.ts) (GIF Grid)
    *   [`tweb_reference/src/components/emoticonsDropdown/`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/emoticonsDropdown) (Tabs manager)

#### 35. Sticker Picker
*   **tweb Implementation**: StickersTab — categorized by emoji, faved/recent/premium, search, Lottie animations
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ✅ Need `GET stickers` endpoint
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/popups/stickers.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/popups/stickers.tsx) (Pack loading / grids)
    *   [`tweb_reference/src/scss/partials/_stickerViewer.scss`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/scss/partials/_stickerViewer.scss)

#### 36. Full Emoji Picker
*   **tweb Implementation**: Categories (recent/smileys/animals/food/travel/activities/objects/symbols/flags/custom), search, custom animated emoji
*   **TeleBos Status**: ⚠️ Static 120-emoji grid, no categories
*   **Backend Needed?**: ❌ Frontend only
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/emoticonsDropdown/`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/emoticonsDropdown) (Emoji category search dropdown)

#### 37. Mention Autocomplete
*   **tweb Implementation**: MentionsHelper — @ triggers user suggestions dropdown from group members
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ✅ Need `GET members` for groups
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/mentionsHelper.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/mentionsHelper.ts) (Trigger tracking)

#### 38. Bot Command Autocomplete
*   **tweb Implementation**: CommandsHelper — / triggers bot command suggestions with descriptions
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ❌ Frontend (parse from message data)
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/botCommands.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/botCommands.ts) & [`commandsHelper.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/commandsHelper.ts)

#### 39. Inline Bot Results
*   **tweb Implementation**: InlineHelper — @bot query shows inline result grid
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ✅ Need inline query endpoint
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/inlineHelper.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/inlineHelper.ts) (Query listener and grid rendering)

#### 40. Emoji Suggestions
*   **tweb Implementation**: EmojiHelper — colon `:` triggers emoji autocomplete (e.g. `:smile` → 😊)
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ❌ Frontend only (emoji dictionary)
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/emojiHelper.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/emojiHelper.ts) (Colon autocomplete detector)

#### 41. Rich Text Input
*   **tweb Implementation**: contenteditable div with RichInputHandler — bold/italic/code/link/strikethrough formatting via markdown parsing
*   **TeleBos Status**: ❌ Plain textarea only
*   **Backend Needed?**: ❌ Frontend only
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/input.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/input.ts) (Rich formatting keystroke handling)
    *   [`tweb_reference/src/components/inputFieldMessage.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/inputFieldMessage.tsx) (ContentEditable element wrapper)

#### 42. Attach Menu
*   **tweb Implementation**: File, photo, poll, contact, location — via AttachMenuButton
*   **TeleBos Status**: ⚠️ Only file attach button
*   **Backend Needed?**: ❌ Frontend enhancement
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/attachMenuButton.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/attachMenuButton.tsx) (Popup triggers)
    *   [`tweb_reference/src/components/popups/mediaAttacher.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/popups/mediaAttacher.ts) (Menu UI list)

#### 43. Send Menu
*   **tweb Implementation**: Scheduling, silent send, send-as (for channels)
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ❌ Frontend + schedule param
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/sendContextMenu.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/sendContextMenu.ts) (Hold send button context options)

#### 44. Draft Management
*   **tweb Implementation**: Auto-save + restore per chat, synced via `dialog_draft` event
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ❌ Frontend localStorage + WS sync
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/input.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/input.ts) (Syncing timer)

#### 45. Slow Mode Timer
*   **tweb Implementation**: Countdown display in input area
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ❌ Frontend from chat info
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/input.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/input.ts) (Blocker overlay)

#### 46. Reply Container
*   **tweb Implementation**: Shows reply preview above input with close button
*   **TeleBos Status**: ✅ Already implemented
*   **Backend Needed?**: ❌
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/replyContainer.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/replyContainer.ts) (Close event + previews)

---

### MESSAGE MEDIA RENDERING

#### 47. Photo Albums
*   **tweb Implementation**: Grouped album detection via `prepareAlbum.ts` — multi-photo in one bubble with grid layout
*   **TeleBos Status**: ❌ Single photos only
*   **Backend Needed?**: ❌ Frontend grouping logic
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/prepareAlbum.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/prepareAlbum.ts) (Collates album media dimensions)

#### 48. Progressive Image Loading
*   **tweb Implementation**: ProgressivePreloader — blurred thumbnail → full image
*   **TeleBos Status**: ⚠️ Basic lazy load, no progressive
*   **Backend Needed?**: ❌ Frontend only
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/preloader.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/preloader.ts) & [`putPreloader.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/putPreloader.ts)

#### 49. Video Player
*   **tweb Implementation**: Custom VideoPlayer with quality selector, storyboard hover preview, HLS streaming, PIP
*   **TeleBos Status**: ⚠️ Native `<video>` element
*   **Backend Needed?**: ❌ Frontend enhancement
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/appMediaPlaybackController.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/appMediaPlaybackController.ts) (Custom overlay controls & playbacks)

#### 50. Audio Player
*   **tweb Implementation**: Playback with progress bar, speed control (1x/1.5x/2x), seek bar
*   **TeleBos Status**: ⚠️ Basic waveform + Audio element
*   **Backend Needed?**: ❌ Frontend enhancement
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/audio.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/audio.ts) & [`tweb_reference/src/components/chat/audio.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/audio.tsx)

#### 51. Document Viewer
*   **tweb Implementation**: File icon + name + size, download button, streaming for audio/video docs
*   **TeleBos Status**: ✅ `MessageDocument` implemented
*   **Backend Needed?**: ❌
*   **tweb Source Code**:
    *   [`tweb_reference/src/scss/partials/_document.scss`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/scss/partials/_document.scss) (Card layouts)

#### 52. Round Video Messages
*   **tweb Implementation**: Circular video loop with Lottie fallback
*   **TeleBos Status**: ✅ `MessageVideoNote` implemented
*   **Backend Needed?**: ❌
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/bubbles.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/bubbles.ts) (Circular masks)

#### 53. Sticker Rendering
*   **tweb Implementation**: RLottie animation (WASM) or static thumb, premium effects, dice stickers
*   **TeleBos Status**: ⚠️ Static image only
*   **Backend Needed?**: ❌ Frontend only (need Lottie/WASM)
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/stickerViewer.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/stickerViewer.ts) (Animation state + Canvas render)

#### 54. Custom Animated Emoji
*   **tweb Implementation**: CustomEmojiRendererElement with Lottie
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ❌ Frontend only
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/emojiDocumentIcon.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/emojiDocumentIcon.tsx) & [`lottieAnimation.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/lottieAnimation.tsx)

---

### TOP BAR (Chat Header)

#### 55. Pinned Message Plate
*   **tweb Implementation**: PinnedMessagePlate in topbar — shows pinned message preview, animated counter, dismiss button
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ✅ Need pinned message data
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/pinnedMessage.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/pinnedMessage.tsx) (Plate rendering logic)

#### 58. Verification Badge
*   **tweb Implementation**: Blue checkmark icon
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ❌ Frontend from peer data
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/generateVerifiedIcon.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/generateVerifiedIcon.ts)

#### 59. Premium Badge
*   **tweb Implementation**: Star icon for premium users
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ❌ Frontend from peer data
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/generatePremiumIcon.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/generatePremiumIcon.ts)

#### 61. Peer Colors
*   **tweb Implementation**: Group member name colors
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ❌ Frontend color assignment
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/peerColors.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/peerColors.ts) (User ID prefix color mappings)

---

### RIGHT SIDEBAR (Info Drawer)

#### 62. Shared Media Tab
*   **tweb Implementation**: Grid-based media browser with type filters (photos, videos, files, links, music, voice, GIFs)
*   **TeleBos Status**: ⚠️ Basic — filters from loaded messages client-side
*   **Backend Needed?**: ✅ Need `GET shared-media` with type filter + pagination
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/sidebarRight/tabs/sharedMedia.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/sidebarRight/tabs/sharedMedia.tsx) & [`sharedMediaTab.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/sidebarRight/tabs/sharedMediaTab.tsx)

#### 63. Group Members Tab
*   **tweb Implementation**: ChatMembersTab — member list with search, promote/kick
*   **TeleBos Status**: ❌ Right drawer has no members tab
*   **Backend Needed?**: ✅ Need `GET members`, `POST promote`, `POST kick`
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/sidebarRight/tabs/chatMembers.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/sidebarRight/tabs/chatMembers.tsx) (Pagination lists)

#### 64. Group Administrators Tab
*   **tweb Implementation**: ChatAdministratorsTab — admin list with rights editor
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ✅ Need `GET administrators`
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/sidebarRight/tabs/chatAdministrators.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/sidebarRight/tabs/chatAdministrators.tsx)

#### 65. Group Permissions Tab
*   **tweb Implementation**: GroupPermissionsTab — granular permission toggles, slow mode, restrictions
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ✅ Need `GET/PUT permissions`
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/sidebarRight/tabs/groupPermissions/`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/sidebarRight/tabs/groupPermissions) (Toggles logic)

#### 66. Chat Invite Links
*   **tweb Implementation**: ChatInviteLinksTab — created links with expiry, usage limits, approval
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ✅ Need `GET/POST invite-links`
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/sidebarRight/tabs/chatInviteLinks.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/sidebarRight/tabs/chatInviteLinks.tsx) & [`chatInviteLink.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/sidebarRight/tabs/chatInviteLink.tsx)

#### 67. Edit Chat Info
*   **tweb Implementation**: Name, description, photo editing
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ✅ Need `PUT chat-info`
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/sidebarRight/tabs/editChat.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/sidebarRight/tabs/editChat.tsx)

#### 68. Shared Links Tab
*   **tweb Implementation**: Links shared in chat
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ✅ Need from shared-media endpoint
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/sidebarRight/tabs/sharedMedia.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/sidebarRight/tabs/sharedMedia.tsx) (Filter links)

#### 69. Shared Docs/Files Tab
*   **tweb Implementation**: Documents/files shared
*   **TeleBos Status**: ✅ Basic version exists
*   **Backend Needed?**: ❌
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/sidebarRight/tabs/sharedMedia.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/sidebarRight/tabs/sharedMedia.tsx) (Filter files)

#### 71. Poll Results Tab
*   **tweb Implementation**: PollResultsTab — detailed voting breakdown
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ✅ Need poll results data
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/sidebarRight/tabs/pollResults.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/sidebarRight/tabs/pollResults.tsx)

---

### CONTEXT MENUS

#### 74. Message Context Menu
*   **tweb Implementation**: Reply, edit, pin, forward, select, copy, delete, report, translate, download, save to saved, copy link, read date toggle, pay to view
*   **TeleBos Status**: ⚠️ 3 items only (reply, copy, delete)
*   **Backend Needed?**: ❌ Frontend + wired mutations
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/contextMenu.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/contextMenu.ts) (Context options builder)
    *   [`tweb_reference/src/scss/partials/popups/_popup.scss`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/scss/partials/popups/_popup.scss) (Styles)

#### 75. Chat List Context Menu
*   **tweb Implementation**: Archive, pin/unpin, mute/unmute, mark read/unread, leave/delete, clear history, folder management
*   **TeleBos Status**: ❌ Only hover buttons
*   **Backend Needed?**: Frontend
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/dialogsContextMenu.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/dialogsContextMenu.ts)

#### 76. Sub-Menus
*   **tweb Implementation**: Nested menus via `createSubmenuTrigger` with mouse distance tracking
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ❌ Frontend
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/createSubmenuTrigger.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/createSubmenuTrigger.ts)

#### 77. Reaction Picker on Context Menu
*   **tweb Implementation**: ChatReactionsMenu floating above context menu
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ❌ Frontend
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chat/reactionsMenu.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chat/reactionsMenu.ts) (Floating picker panel)

---

### MEDIA VIEWER / LIGHTBOX

#### 78. Swipe/Pinch Zoom
*   **tweb Implementation**: SwipeHandler with inertia, snap-to-next, pinch zoom (0.5x-4x)
*   **TeleBos Status**: ⚠️ Basic overlay, no swipe/zoom
*   **Backend Needed?**: ❌ Frontend
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/swipeHandler.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/swipeHandler.ts) (Pinch/swipe gestures)

#### 79. Grouped Album Navigation
*   **tweb Implementation**: Next/prev arrows for multi-photo albums
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ❌ Frontend
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/appMediaViewerBase.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/appMediaViewerBase.ts) (Lightbox gallery)

#### 80. Video Quality Selector
*   **tweb Implementation**: `getQualityFilesEntries` / `snapQualityHeight`
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ❌ Frontend (Telegram sends multiple quality files)
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/appMediaPlaybackController.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/appMediaPlaybackController.ts) (Video options drawer)

#### 81. Open/Close Transition
*   **tweb Implementation**: 200ms scale animation from origin bubble position to full screen
*   **TeleBos Status**: ❌ Simple fade overlay
*   **Backend Needed?**: ❌ Frontend
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/appMediaViewerBase.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/appMediaViewerBase.ts) (Origin bounding rect transitions)

---

### LEFT SIDEBAR SETTINGS MENU

#### 83. Settings Tabs
*   **tweb Implementation**: Edit Profile, General, Notifications, Privacy & Security, Data & Storage, Chat Folders, Chat Background, Stickers & Emoji, Language, Power Saving, Premium, Active Sessions, Passcode Lock, Keyboard Shortcuts, FAQ, Log Out
*   **TeleBos Status**: ⚠️ 3 items (dark mode toggle, notifications toggle placeholder, "TeleBos Client" label)
*   **Backend Needed?**: ❌ Mostly frontend
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/sidebarLeft/tabs/settings.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/sidebarLeft/tabs/settings.tsx) (Settings menu layout)

#### 84. Theme Picker
*   **tweb Implementation**: Day/Night/Light/Tinted/System with accent color picker, wallpaper selection
*   **TeleBos Status**: ⚠️ Only dark/light toggle, no persistence
*   **Backend Needed?**: ❌ Frontend + localStorage
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chatThemesPicker.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chatThemesPicker.tsx) & [`colorPicker.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/colorPicker.ts)

#### 85. Edit Profile
*   **tweb Implementation**: Name, bio, username, profile photo from left menu
*   **TeleBos Status**: ❌ (TeleBos has account settings pages but not in chat)
*   **Backend Needed?**: ✅ Backend already has profile endpoints
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/sidebarLeft/tabs/editProfile.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/sidebarLeft/tabs/editProfile.tsx)

---

### THEMING

#### 86. CSS Custom Properties
*   **tweb Implementation**: `--primary-color`, `--surface-color`, `--message-background-color`, etc. — runtime-switchable
*   **TeleBos Status**: ❌ Uses Tailwind with hardcoded `.dark` class
*   **Backend Needed?**: ❌ Frontend refactor
*   **tweb Source Code**:
    *   [`tweb_reference/src/scss/partials/_themes.scss`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/scss/partials/_themes.scss)

#### 87. Accent Color System
*   **tweb Implementation**: `changeColorAccent()` recomputes all derivatives from hex
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ❌ Frontend
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/colorPicker.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/colorPicker.ts) & [`chatThemesPicker.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chatThemesPicker.tsx)

#### 88. Theme Transitions
*   **tweb Implementation**: `dispatchHeavyAnimationEvent()` pauses Lottie/video during theme switch, ViewTransition API, 2000ms cap
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ❌ Frontend
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/chatThemesPicker.tsx`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/chatThemesPicker.tsx)

---

### GLOBAL UI

#### 89. Telegram Icon Font
*   **tweb Implementation**: tgico — 2000+ custom icons as font glyphs
*   **TeleBos Status**: ❌ Using emoji + text labels
*   **Backend Needed?**: ❌ Need `tgico` font integration
*   **tweb Source Code**:
    *   [`tweb_reference/src/scss/tgico.scss`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/scss/tgico.scss) (Glyph to word ligatures map)
    *   [`tweb_reference/fonts/tgico.ttf`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/fonts/tgico.ttf) (TrueType font file)

#### 90. RTL Support
*   **tweb Implementation**: `--reflect: -1` CSS variable + automatic RTL detection, text direction mirror
*   **TeleBos Status**: ❌ No RTL
*   **Backend Needed?**: ❌ Frontend
*   **tweb Source Code**:
    *   [`tweb_reference/src/scss/base.scss`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/scss/base.scss)

#### 91. Navigation Controller
*   **tweb Implementation**: AppNavigationController — history-based navigation stack (left/right/chat/im/media/menu)
*   **TeleBos Status**: ❌ Next.js App Router handles page nav, but chat internal nav is limited
*   **Backend Needed?**: ❌ Frontend
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/appNavigationController.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/appNavigationController.ts)

#### 92. Transition Animations
*   **tweb Implementation**: TransitionSlider — direction-aware slide transitions (forward/backward) on panel changes
*   **TeleBos Status**: ❌ Minimal framer-motion on sidebar only
*   **Backend Needed?**: ❌ Frontend
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/transition.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/transition.ts) & [`singleTransition.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/singleTransition.ts)

#### 93. Heavy Animation Suspension
*   **tweb Implementation**: `useHeavyAnimationCheck` pauses Lottie/video during page transitions
*   **TeleBos Status**: ❌
*   **Backend Needed?**: ❌ Frontend
*   **tweb Source Code**:
    *   [`tweb_reference/src/components/animationIntersector.ts`](file:///C:/Users/yudha/Downloads/NEALMTROY/PROJECT/TeleBos/tweb_reference/src/components/animationIntersector.ts) (Event listeners during transition shifts)

---

## 📐 PART 3: BACKEND GAPS

These endpoints/features need to be added to the FastAPI backend:

| Priority | Endpoint / Service | Purpose |
| :--- | :--- | :--- |
| **P0** | `POST /accounts/{id}/chats/{chat_id}/messages/{msg_id}/delete` | Delete messages (for me / for everyone) |
| **P0** | `PUT /accounts/{id}/chats/{chat_id}/messages/{msg_id}` | Edit message text |
| **P0** | `POST /accounts/{id}/chats/{chat_id}/messages/forward` | Forward messages to peer(s) |
| **P0** | `GET /accounts/{id}/chats/{chat_id}/shared-media` | Shared media/documents/files/links with type filter + pagination |
| **P0** | `POST /accounts/{id}/chats/{chat_id}/messages/{msg_id}/reaction` | Send/remove reaction |
| **P0** | `GET /accounts/{id}/chats/{chat_id}/messages/{msg_id}/reactions` | Get who reacted |
| **P0** | `POST /accounts/{id}/chats/{chat_id}/messages/{msg_id}/pin` | Pin message |
| **P0** | `POST /accounts/{id}/chats/{chat_id}/messages/{msg_id}/unpin` | Unpin message |
| **P0** | `GET /accounts/{id}/chats/{chat_id}/pinned` | Get pinned messages |
| **P1** | `GET /accounts/{id}/chats/search` | Search messages across chats |
| **P1** | `GET /accounts/{id}/chats/{chat_id}/messages/search` | Search messages in specific chat with filters (media type, date range, from user) |
| **P1** | `GET /accounts/{id}/chats/{chat_id}/members` | Group/channel member list with pagination + search |
| **P1** | `POST /accounts/{id}/chats/{chat_id}/members/{user_id}/promote` | Promote member to admin with rights editor |
| **P1** | `POST /accounts/{id}/chats/{chat_id}/members/{user_id}/kick` | Remove member |
| **P1** | `POST /accounts/{id}/chats/{chat_id}/mute` | Mute chat notifications (duration) |
| **P1** | `POST /accounts/{id}/chats/{chat_id}/unmute` | Unmute chat |
| **P1** | `PUT /accounts/{id}/chats/{chat_id}/info` | Edit chat name, description |
| **P1** | `GET /accounts/{id}/chats/{chat_id}/permissions` | Get group default permissions |
| **P1** | `PUT /accounts/{id}/chats/{chat_id}/permissions` | Update group permissions |
| **P1** | `GET /accounts/{id}/stickers` | Get installed sticker packs |
| **P2** | `POST /accounts/{id}/chats/{chat_id}/messages/schedule` | Schedule a message |
| **P2** | `GET /accounts/{id}/chats/{chat_id}/messages/scheduled` | Get scheduled messages |
| **P2** | `DELETE /accounts/{id}/chats/{chat_id}/messages/scheduled/{msg_id}` | Delete scheduled message |
| **P2** | `POST /accounts/{id}/chats/{chat_id}/poll` | Create poll |
| **P2** | `POST /accounts/{id}/chats/{chat_id}/messages/{msg_id}/poll/vote` | Vote on poll |
| **P2** | `GET /accounts/{id}/chats/{chat_id}/messages/{msg_id}/poll/results` | Get poll results |
| **P2** | `GET /accounts/{id}/chats/{chat_id}/invite-links` | Get invite links |
| **P2** | `POST /accounts/{id}/chats/{chat_id}/invite-links` | Create invite link |

---

## 📐 PART 4: FRONTEND REFACTOR PLAN

Target: Proper component hierarchy matching tweb's structure:

```
src/components/chat/
├── ChatShell.tsx              ← 3-column layout orchestrator
├── ChatLeftColumn.tsx         ← Chat list panel container
│   ├── ChatListHeader.tsx     ← Account selector, folder tabs, search toggle
│   ├── ChatFolderTabs.tsx     ← Horizontal folder tabs with unread badges
│   ├── ChatSearchInput.tsx    ← Global chat search
│   ├── ChatList.tsx           ← Infinite-scroll chat rows
│   ├── ChatRow.tsx            ← Single chat row (avatar, title, last msg, unread, typing, online)
│   ├── ChatRowContextMenu.tsx ← Right-click menu per chat row
│   └── ChatListSelectionBar.tsx ← Multi-select action bar
├── ChatCenterColumn.tsx       ← Message pane container
│   ├── ChatTopbar.tsx         ← Peer title, status, pinned message bar, back/search/call
│   ├── ChatBubbles.tsx        ← Virtual-scrolled message list
│   │   ├── MessageBubble.tsx       ← Single bubble shell (tail, group position, date, sender)
│   │   ├── ServiceMessage.tsx      ← Join/leave/pin service messages
│   │   ├── PinnedMessagePlate.tsx  ← Pinned message bar at top
│   │   ├── MessageReactions.tsx    ← Reaction bubbles + picker
│   │   ├── MessageReplies.tsx      ← Reply footer with stacked avatars
│   │   ├── MessagePoll.tsx         ← Poll rendering (bars, quiz)
│   │   ├── MessagePhoto.tsx        ← Photo (standalone + album grid)
│   │   ├── MessageVideo.tsx        ← Video player
│   │   ├── MessageAudio.tsx        ← Audio/voice playback with seek
│   │   ├── MessageDocument.tsx     ← Document/file download
│   │   ├── MessageSticker.tsx      ← Animated sticker
│   │   ├── MessageRoundVideo.tsx   ← Circular video note
│   │   ├── MessageWebPage.tsx      ← Link preview card
│   │   ├── MessageForwardHeader.tsx← "Forwarded from" header
│   │   └── DateSeparator.tsx       ← Sticky date pill
│   ├── ChatSelectionBar.tsx   ← Multi-select action bar
│   ├── ChatSearch.tsx         ← In-chat search panel with filters
│   ├── ChatContextMenu.tsx    ← Right-click message menu (reply, edit, pin, forward, copy, delete, etc.)
│   └── ChatInput.tsx          ← Message composer
│       ├── ReplyPreview.tsx        ← Reply container above input
│       ├── RichTextEditor.tsx      ← ContentEditable with markdown
│       ├── EmojiPicker.tsx         ← Full emoji picker (categories, search, recent)
│       ├── GifPicker.tsx           ← GIF picker (trending, search)
│       ├── StickerPicker.tsx       ← Sticker picker (packs, categories)
│       ├── MentionAutocomplete.tsx ← @mention suggestions
│       ├── CommandAutocomplete.tsx ← /command suggestions
│       ├── EmojiAutocomplete.tsx   ← :emoji: suggestions
│       ├── AttachMenu.tsx          ← File/photo/poll/location menu
│       ├── SendMenu.tsx            ← Schedule, silent send
│       ├── VoiceRecorder.tsx       ← Voice/video message recording UI
│       └── SchedulePicker.tsx      ← Calendar picker for scheduling
├── ChatRightColumn.tsx        ← Info drawer container
│   ├── RightDrawerHeader.tsx  ← Tab bar (Shared Media, Members, Administrators, etc.)
│   ├── SharedMediaTab.tsx     ← Media grid with type filters + pagination
│   ├── SharedDocsTab.tsx      ← Documents/files
│   ├── SharedLinksTab.tsx     ← Links
│   ├── ChatMembersTab.tsx     ← Member list with search
│   ├── ChatAdminsTab.tsx      ← Admin list
│   ├── GroupPermissionsTab.tsx← Permission toggles
│   ├── ChatInviteLinksTab.tsx ← Invite links management
│   └── EditChatTab.tsx        ← Name, description, photo editing
├── MediaViewer.tsx            ← Full-screen lightbox
│   ├── MediaViewerPhoto.tsx   ← Zoom/pinch/swipe
│   ├── MediaViewerVideo.tsx   ← Video player with quality selector
│   └── MediaViewerControls.tsx← Download, zoom controls
├── Popups/
│   ├── PopupForward.tsx       ← Forward message dialog
│   ├── PopupDeleteMessages.tsx← Delete confirmation
│   ├── PopupNewMedia.tsx      ← Photo/file send preview with caption
│   ├── PopupPinMessage.tsx    ← Pin confirmation
│   ├── PopupPoll.tsx          ← Poll creation
│   ├── PopupSchedule.tsx      ← Schedule message
│   └── PopupPeer.tsx          ← Peer profile popup
└── ChatLeftMenu.tsx           ← Settings popup in left column
    ├── ProfileSettings.tsx
    ├── ThemeSettings.tsx      ← Day/Night/Tinted/System + accent color
    └── NotificationSettings.tsx
```

---

## 📐 PART 5: IMPLEMENTATION PHASES

### Phase 1 — Backend API Gap Fill (4-5 days)
*   Delete/edit/forward/pin/reaction endpoints
*   Shared media endpoint with type filters
*   Chat search endpoint(s)
*   Group members/admins/permissions endpoints
*   Mute/unmute endpoints
*   New WebSocket event types

### Phase 2 — Frontend Component Split (3-4 days)
*   Split 2361-line chats/page.tsx into the hierarchy above
*   Extract each component into its own file
*   Build proper React component interfaces

### Phase 3 — Core UI Matching (5-7 days)
*   Full 3-column animated layout (left/center/right with slide transitions)
*   CSS custom properties theming (match tweb's color system)
*   tgico font integration (or SVG icon equivalents)
*   Context menu system (message + chat list)
*   Message selection mode
*   Proper right drawer tabs (members, admins, permissions, links)

### Phase 4 — Media & Input Enhancement (4-5 days)
*   Full emoji picker with categories + search
*   GIF picker (Tenor API or Telegram GIF API)
*   Sticker picker with Lottie rendering
*   Voice message recording + playback seek
*   Rich text input (contenteditable + markdown)
*   Mention/command/emoji autocomplete
*   Poll creation + rendering

### Phase 5 — Advanced Features (3-4 days)
*   In-chat message search with type filters + date jump
*   Media viewer enhancements (swipe, pinch zoom, album navigation)
*   Message forwarding dialog
*   Scheduled messages
*   Theme customization (accent colors, wallpapers)
*   Left settings menu expansion
*   RTL support

### Phase 6 — Polish & Performance (2-3 days)
*   Virtual scrolling for message list
*   Progressive image loading (blur → full)
*   Theme transitions
*   Service message rendering
*   All context menu sub-options
*   Draft auto-save/restore
