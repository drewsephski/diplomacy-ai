"""JSON/stdin boundary for the pinned, authoritative Diplomacy adjudicator.

No AI, diplomacy, or private memory is ever sent to the engine.
"""
import json
import sys

from diplomacy import Game


def describe(game):
    possible = game.get_all_possible_orders()
    locations = game.get_orderable_locations()
    return {
        "engine": game.to_dict(),
        "board": game.get_state(),
        "legal": {
            power: {loc: sorted(possible.get(loc, [])) for loc in locs}
            for power, locs in locations.items()
        },
        "done": game.is_game_done,
        "outcome": game.outcome,
    }


def validate(game, submitted):
    legal = describe(game)["legal"]
    unknown = set(submitted) - set(game.powers)
    if unknown:
        raise ValueError(f"Unknown powers: {sorted(unknown)}")
    for power in game.powers:
        orders = submitted.get(power, [])
        allowed = {order for options in legal[power].values() for order in options}
        seen = set()
        for order in orders:
            if order == "WAIVE" and game.phase_type == "A" and game.get_state()["builds"][power]["count"] > 0:
                continue
            if order not in allowed:
                raise ValueError(f"Illegal order for {power}: {order}")
            location = order.split()[1].split('/')[0]
            if location in seen:
                raise ValueError(f"Duplicate order for {power} at {location}")
            seen.add(location)
        if game.phase_type in ("M", "R"):
            expected = {loc.split('/')[0] for loc in legal[power]}
            if seen != expected:
                raise ValueError(f"{power} needs one order per unit; missing {sorted(expected - seen)}")
        else:
            count = game.get_state()["builds"][power]["count"]
            if len(orders) > abs(count) or (count < 0 and len(orders) != -count):
                raise ValueError(f"Wrong adjustment count for {power}: {count}")
    return submitted


def execute(request):
    game = Game.from_dict(request["engine"]) if request.get("engine") else Game()
    action = request.get("action", "inspect")
    if action in ("resolve", "validate"):
        validate(game, request["orders"])
        for power, orders in request["orders"].items():
            game.set_orders(power, orders)
        if game.error:
            raise ValueError(str(game.error))
        if action == "resolve":
            phase = game.process()
            result = describe(game)
            result["resolution"] = phase.to_dict() if phase else None
            return result
    return describe(game)


if __name__ == "__main__":
    try:
        print(json.dumps(execute(json.load(sys.stdin))))
    except Exception as exc:  # noqa: BLE001 - subprocess boundary must report all engine failures as JSON.
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)
