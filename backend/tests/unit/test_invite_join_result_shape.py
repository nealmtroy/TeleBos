"""Regression: messages.ImportChatInvite response shape.

Telegram can answer ``ImportChatInvite`` with either:
  * a bare ``Updates`` (older API layers) exposing ``.chats``;
  * ``messages.ChatInviteJoinResultOk`` (newer API layers) which nests the
    ``Updates`` under ``.updates``.

Reading only ``result.chats`` made every fresh invite-link join on a new API
layer return no entity and surface as the misleading
"Could not resolve or join the group/channel." even though the join succeeded.
"""

from types import SimpleNamespace

from app.services.group_admin_service import _entity_from_invite_join


class _Chat:
    def __init__(self, cid):
        self.id = cid


def test_bare_updates_shape_is_read():
    updates = SimpleNamespace(chats=[_Chat(111)])
    assert _entity_from_invite_join(updates).id == 111


def test_join_result_ok_nested_shape_is_read():
    updates = SimpleNamespace(chats=[_Chat(222)], users=[], updates=[], date=None, seq=0)
    result = SimpleNamespace(updates=updates)  # messages.ChatInviteJoinResultOk(updates=...)
    assert not hasattr(result, "chats")
    assert _entity_from_invite_join(result).id == 222


def test_missing_chats_returns_none():
    assert _entity_from_invite_join(SimpleNamespace(chats=[])) is None
    assert _entity_from_invite_join(SimpleNamespace(updates=SimpleNamespace(chats=[]))) is None
    assert _entity_from_invite_join(SimpleNamespace()) is None
