"""Boundary regressions around the upstream adjudicator (not a replacement ruleset)."""
import pytest
from bridge import describe, execute, validate
from diplomacy import Game


def empty_game(phase='S1901M'):
    game = Game()
    game.clear_units()
    game.set_current_phase(phase)
    return game


def orders_for(game, overrides=None):
    orders = {}
    info = describe(game)
    for power, locations in info['legal'].items():
        orders[power] = []
        for options in locations.values():
            hold = next((o for o in options if o.endswith(' H')), None)
            if hold:
                orders[power].append(hold)
    orders.update(overrides or {})
    return orders


def resolve(game, overrides):
    return execute({'action': 'resolve', 'engine': game.to_dict(), 'orders': orders_for(game, overrides)})


def test_standard_1901_position():
    state = describe(Game())
    assert state['board']['name'] == 'S1901M'
    assert sum(len(u) for u in state['board']['units'].values()) == 22
    assert len(Game().map.scs) == 34
    assert state['board']['units']['RUSSIA'] == ['A WAR', 'A MOS', 'F SEV', 'F STP/SC']
    assert 'F BRE - ENG' in state['legal']['FRANCE']['BRE']


def test_equal_attacks_bounce():
    g = empty_game()
    g.set_units('FRANCE', ['A PAR'])
    g.set_units('GERMANY', ['A MUN'])
    out = resolve(g, {'FRANCE': ['A PAR - BUR'], 'GERMANY': ['A MUN - BUR']})
    assert out['board']['units']['FRANCE'] == ['A PAR']
    assert out['board']['units']['GERMANY'] == ['A MUN']
    assert out['resolution']['results']['A PAR']


def test_supported_attack_dislodges_and_retreat_resolves():
    g = empty_game()
    g.set_units('FRANCE', ['A BUR', 'A RUH'])
    g.set_units('GERMANY', ['A MUN'])
    out = resolve(g, {'FRANCE': ['A BUR - MUN', 'A RUH S A BUR - MUN']})
    assert out['board']['name'] == 'S1901R'
    assert 'A MUN' in out['board']['retreats']['GERMANY']
    retreat = next(o for o in out['legal']['GERMANY']['MUN'] if ' R ' in o)
    out2 = execute({'action':'resolve', 'engine':out['engine'], 'orders': {'GERMANY':[retreat]}})
    assert out2['board']['name'] == 'F1901M'
    assert not out2['board']['retreats']['GERMANY']


def test_attack_cuts_support():
    g = empty_game()
    g.set_units('FRANCE', ['A BUR', 'A RUH'])
    g.set_units('GERMANY', ['A MUN', 'A KIE'])
    out = resolve(g, {'FRANCE':['A BUR - MUN', 'A RUH S A BUR - MUN'], 'GERMANY':['A MUN H', 'A KIE - RUH']})
    assert 'A MUN' in out['board']['units']['GERMANY']
    assert 'A BUR' in out['board']['units']['FRANCE']


def test_convoy_moves_army_over_sea():
    g = empty_game()
    g.set_units('ENGLAND', ['A LON', 'F NTH'])
    out = resolve(g, {'ENGLAND':['A LON - BEL VIA', 'F NTH C A LON - BEL']})
    assert 'A BEL' in out['board']['units']['ENGLAND']


def test_autumn_capture_and_home_build():
    g = empty_game('F1901M')
    g.set_units('FRANCE', ['A SPA', 'A PAR', 'F BRE'])
    out = resolve(g, {'FRANCE':['A SPA - POR', 'A PAR H', 'F BRE H']})
    assert 'POR' in out['board']['centers']['FRANCE']
    assert out['board']['name'] == 'W1901A'
    assert out['board']['builds']['FRANCE']['count'] == 1
    out2 = execute({'action':'resolve', 'engine':out['engine'], 'orders':{'FRANCE':['A MAR B']}})
    assert 'A MAR' in out2['board']['units']['FRANCE']
    assert out2['board']['name'] == 'S1902M'


def test_disbands_and_illegal_builds():
    g = empty_game('W1901A')
    g.clear_centers()
    g.set_centers('FRANCE', ['PAR'])
    g.set_units('FRANCE', ['A PAR', 'A MAR'])
    with pytest.raises(ValueError, match='adjustment count'):
        validate(g, {'FRANCE':[]})
    out = execute({'action':'resolve', 'engine':g.to_dict(), 'orders':{'FRANCE':['A MAR D']}})
    assert out['board']['units']['FRANCE'] == ['A PAR']


def test_validation_rejects_illegal_duplicate_missing_orders():
    g = Game()
    base = orders_for(g)
    with pytest.raises(ValueError, match='Illegal order'):
        validate(g, {**base, 'FRANCE':['A PAR - MOS','A MAR H','F BRE H']})
    with pytest.raises(ValueError, match='Duplicate order'):
        validate(g, {**base, 'FRANCE':['A PAR H','A PAR - BUR','A MAR H','F BRE H']})
    with pytest.raises(ValueError, match='one order per unit'):
        validate(g, {**base, 'FRANCE':[]})
    with pytest.raises(ValueError, match='Unknown powers'):
        validate(g, {**base, 'SPAIN':[]})


def test_roundtrip_preserves_adjudication():
    g = Game()
    orders = orders_for(g)
    one = execute({'action':'resolve','engine':g.to_dict(),'orders':orders})
    two = execute({'action':'resolve','engine':Game.from_dict(g.to_dict()).to_dict(),'orders':orders})
    assert one['board']['units'] == two['board']['units']
    assert one['board']['centers'] == two['board']['centers']
    assert one['board']['name'] == two['board']['name']


def test_eighteen_centers_end_game_with_a_solo_winner():
    g = empty_game('F1901M')
    g.clear_centers()
    g.set_centers('FRANCE', list(g.map.scs)[:17])
    g.set_units('FRANCE', ['A SPA'])
    out = resolve(g, {'FRANCE': ['A SPA - POR']})
    assert out['done']
    assert out['outcome'][1:] == ['FRANCE']
