"""Phase C6b: Frontend rendering refinement tests.

Finding: FE2-010 (MutationObserver subtree).

Analysis: Original recommendation was `subtree: false, childList: true`.
Investigation revealed subtree: true IS LOAD-BEARING:
- Dashboard groups expand by conditionally rendering DashboardGrid inside
  an EXISTING direct child (group section div).
- childList: false would NOT fire for panel elements added deep in the tree.
- The callback already short-circuits: only processes nodes with data-panel-id.
- The real "overkill" concern is callback invocation count, not processing cost.

Resolution: Won't Fix (subtree removal would break viewport optimization for
grouped panels). Document as investigated-and-retained.
"""

import pathlib


class TestFE2010MutationObserverConfig:
    """FE2-010: Verify MutationObserver is correctly configured."""

    def test_mutation_observer_uses_child_list(self):
        """MutationObserver must observe childList (not characterData or attributes)."""
        source = pathlib.Path(
            "frontend/src/hooks/useVisiblePanels.ts"
        ).read_text(encoding="utf-8")
        assert "childList: true" in source

    def test_mutation_observer_uses_subtree(self):
        """subtree: true is REQUIRED — group expansion adds panels deep in tree.

        This test documents the investigation result: subtree is load-bearing.
        Removing it would break viewport optimization for grouped dashboard panels.
        """
        source = pathlib.Path(
            "frontend/src/hooks/useVisiblePanels.ts"
        ).read_text(encoding="utf-8")
        assert "subtree: true" in source

    def test_callback_only_processes_panel_id_elements(self):
        """Callback filters to data-panel-id elements only (performance guard)."""
        source = pathlib.Path(
            "frontend/src/hooks/useVisiblePanels.ts"
        ).read_text(encoding="utf-8")
        assert "node.dataset.panelId" in source or 'dataset.panelId' in source

    def test_does_not_observe_attributes_or_character_data(self):
        """MutationObserver must NOT observe attributes or characterData (perf waste)."""
        source = pathlib.Path(
            "frontend/src/hooks/useVisiblePanels.ts"
        ).read_text(encoding="utf-8")
        # Ensure no attributes: true or characterData: true in observer config
        assert "attributes: true" not in source
        assert "characterData: true" not in source
