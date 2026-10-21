from livekit import api

from .config import Settings


def make_token(s: Settings, *, identity: str, name: str, room: str, can_publish: bool = True) -> str:
    return (api.AccessToken(s.livekit_api_key, s.livekit_api_secret)
            .with_identity(identity).with_name(name)
            .with_grants(api.VideoGrants(room_join=True, room=room, can_publish=can_publish,
                                         can_subscribe=True, can_publish_data=True))
            .to_jwt())


def _http_url(s: Settings) -> str:
    return s.livekit_url.replace("wss://", "https://").replace("ws://", "http://")


async def set_can_publish(s: Settings, room: str, identity: str, can_publish: bool) -> None:
    lk = api.LiveKitAPI(_http_url(s), s.livekit_api_key, s.livekit_api_secret)
    try:
        await lk.room.update_participant(api.UpdateParticipantRequest(
            room=room, identity=identity,
            permission=api.ParticipantPermission(
                can_subscribe=True, can_publish=can_publish, can_publish_data=True)))
    finally:
        await lk.aclose()


async def remove_participant(s: Settings, room: str, identity: str) -> None:
    lk = api.LiveKitAPI(_http_url(s), s.livekit_api_key, s.livekit_api_secret)
    try:
        await lk.room.remove_participant(api.RoomParticipantIdentity(room=room, identity=identity))
    finally:
        await lk.aclose()
