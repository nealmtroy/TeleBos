"""Canonical allowlist of SMM service IDs this deployment exposes.

Any order whose ``service_id`` is not in this set is rejected before pricing
runs, before the balance is touched, and before the provider is called. The check
lives in :func:`app.services.order_service._get_effective_price` and
:func:`app.services.order_service.create_single_order`; both the single and batch
endpoints in ``app/api/orders.py`` rely on it.

This is the only place an ID may be added. ``app/api/orders.py`` imports from here
so the API layer and the service layer can never disagree about what is sellable.

Add only IDs that exist in the provider catalogue: a typo here surfaces as a
"not found in catalog" error when an order is placed, not at deploy time.
"""

ALLOWED_SMM_SERVICE_IDS: set[int] = {
    # ── Telegram Members/Subscribers ──────────────────────────────────────────
    34794, 55678, 34795, 34519, 65572, 65497, 50131, 67394, 57127, 34134,
    67393, 33857, 34048, 34291, 34329, 34213, 34214, 34327, 34328, 55679,
    34049, 34050, 55680, 33689, 34216, 67392, 36222, 67391, 24568, 24569,
    24570,
    # ── Telegram Auto Reactions ───────────────────────────────────────────────
    48899, 48900, 48901, 48903, 48907,
    # ── Telegram Reactions ────────────────────────────────────────────────────
    36431, 36432, 36433, 36439, 36441, 36442, 36445, 36447, 36453, 36459,
    47285, 47287, 47288, 47291, 47292, 47295, 47300, 47302, 47319, 47320,
    47327, 47328, 47329, 47331, 32321, 35034,
    # ── Telegram Post Views (legacy 7xx series) ────────────────────────────────
    7836, 7837, 7838, 7839, 7840, 7841, 7842,
    # ── Telegram Auto Post Views ──────────────────────────────────────────────
    48471, 48472, 48474, 48475, 48476, 48478,
    22785, 22786, 22787, 22788, 22789, 22790, 22792, 22794,
    # ── Telegram Post Views (extended series) ─────────────────────────────────
    7985, 8044, 10808, 10809, 25690, 29540, 32147, 33862, 34293, 34672,
    45340, 45341, 47040, 47041, 47051, 47052, 47117, 52806, 65659, 65752,
    68116, 78615, 78699,
}