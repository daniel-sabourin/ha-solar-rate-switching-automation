import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from custom_components.rate_advisor.coordinator import _find_optimal_backdate, _compute_result

HI = 0.35
LO = 0.08
DIFF = HI - LO


def days(*nets):
    """Build a window list from net kWh values (oldest first)."""
    return [{"date": f"2026-01-{i+1:02d}", "net": n} for i, n in enumerate(nets)]


# ---------------------------------------------------------------------------
# _find_optimal_backdate
# ---------------------------------------------------------------------------

class TestFindOptimalBackdate:
    def test_high_finds_best_export_window(self):
        window = days(-5, +10, +20, -3)
        # suffix sums from each date: -5+10+20-3=22, 10+20-3=27, 20-3=17, -3
        # max suffix sum = 27 starting at day 2
        date, savings, raw = _find_optimal_backdate(window, "high", DIFF)
        assert date == "2026-01-02"
        assert raw == pytest.approx(27)

    def test_low_finds_best_import_window(self):
        window = days(+5, -10, -20, +3)
        # negated suffix sums: best is from day 2 = 10+20-3=27
        date, savings, raw = _find_optimal_backdate(window, "low", DIFF)
        assert date == "2026-01-02"
        assert raw == pytest.approx(27)

    def test_no_beneficial_days_returns_none(self):
        # All negative nets — no positive suffix sum exists for "high"
        window = days(-1, -2, -3)
        date, savings, raw = _find_optimal_backdate(window, "high", DIFF)
        assert date is None
        assert savings == 0.0
        assert raw == 0.0

    def test_savings_equals_raw_times_rate_diff(self):
        window = days(+10, +10)
        date, savings, raw = _find_optimal_backdate(window, "high", DIFF)
        assert savings == pytest.approx(raw * DIFF)

    def test_empty_window(self):
        date, savings, raw = _find_optimal_backdate([], "high", DIFF)
        assert date is None


# ---------------------------------------------------------------------------
# _compute_result — recommendation correctness
# ---------------------------------------------------------------------------

class TestComputeResult:
    def test_sustained_high_trend_recommends_high(self):
        # Many days of strong net exports; single bad day at the end.
        # This is the regression case: old code would pick "low" because
        # the bad last day gave it a more recent optimal date.
        nets = [
            -4.5, -2.3, -60.0, +2.4, -6.2, +5.9, -41.0, +11.3,
            +27.8, -30.9, -6.8, +15.2, -16.9, +33.2, +34.1, -30.8,
            -15.2, +28.6, +13.4, -37.8, -3.2, +5.7, +11.2, +3.5,
            +36.6, +33.4, -0.9, +26.9, +5.3, -17.1,
        ]
        window = days(*nets)
        result = _compute_result(window, HI, LO, len(nets))
        assert result.recommended_plan == "high"

    def test_clear_net_importer_recommends_low(self):
        # Consistently negative net — should always recommend low.
        nets = [-10] * 30
        result = _compute_result(days(*nets), HI, LO, 30)
        assert result.recommended_plan == "low"

    def test_clear_net_exporter_recommends_high(self):
        nets = [+10] * 30
        result = _compute_result(days(*nets), HI, LO, 30)
        assert result.recommended_plan == "high"

    def test_spring_transition_recommends_high_when_exports_dominate(self):
        # 15 days of heavy imports followed by 15 days of heavier exports.
        # The export signal should be strong enough to win.
        nets = [-5] * 15 + [+15] * 15   # net exports far exceed net imports
        result = _compute_result(days(*nets), HI, LO, 30)
        assert result.recommended_plan == "high"

    def test_optimal_date_is_set(self):
        nets = [+10] * 10
        result = _compute_result(days(*nets), HI, LO, 10)
        assert result.optimal_date is not None

    def test_savings_are_positive(self):
        nets = [+10] * 10
        result = _compute_result(days(*nets), HI, LO, 10)
        assert result.savings > 0

    def test_window_net_matches_sum(self):
        nets = [1.0, -2.0, 3.0, -4.0, 5.0]
        result = _compute_result(days(*nets), HI, LO, len(nets))
        assert result.window_net == pytest.approx(sum(nets), abs=0.1)

    def test_insufficient_data_returns_none(self):
        result = _compute_result([], HI, LO, 30)
        assert result is None

    def test_trend_improving_for_high(self):
        # Second half much more positive than first half.
        nets = [+1] * 15 + [+10] * 15
        result = _compute_result(days(*nets), HI, LO, 30)
        assert result.recommended_plan == "high"
        assert result.trend == "improving"

    def test_trend_worsening_for_high(self):
        nets = [+10] * 15 + [+1] * 15
        result = _compute_result(days(*nets), HI, LO, 30)
        assert result.recommended_plan == "high"
        assert result.trend == "worsening"
