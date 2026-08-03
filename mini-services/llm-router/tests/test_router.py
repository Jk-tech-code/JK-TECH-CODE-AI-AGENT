from __future__ import annotations

import pytest

from src.models.schemas import RoutingRequest
from src.services.router import ModelRouter, TASK_MODEL_MAP, model_router


@pytest.fixture
def router() -> ModelRouter:
    return ModelRouter()


class TestModelSelection:
    def test_select_model_coding(self, router: ModelRouter):
        routing = RoutingRequest(task_category="coding", estimated_input_tokens=500)
        decision = router.select_model(routing)
        assert decision.model in TASK_MODEL_MAP["coding"]
        assert decision.provider in ("openai", "deepseek", "anthropic")
        assert decision.estimated_cost > 0
        assert decision.capability_match > 0

    def test_select_model_reasoning(self, router: ModelRouter):
        routing = RoutingRequest(task_category="reasoning", requires_thinking=True, estimated_input_tokens=1000)
        decision = router.select_model(routing)
        assert decision.model in ("deepseek-r1", "gpt-5.5", "claude-opus", "gemini-2.5-pro")
        assert decision.priority == 1

    def test_select_model_general(self, router: ModelRouter):
        routing = RoutingRequest(task_category="general", estimated_input_tokens=100)
        decision = router.select_model(routing)
        assert decision.model in TASK_MODEL_MAP["general"]

    def test_select_model_with_vision(self, router: ModelRouter):
        routing = RoutingRequest(task_category="analysis", requires_vision=True, estimated_input_tokens=1000)
        decision = router.select_model(routing)
        cap = router._get_capability(decision.model)
        if cap:
            assert cap.supports_vision is True

    def test_select_model_with_tools(self, router: ModelRouter):
        routing = RoutingRequest(task_category="coding", requires_tools=True, estimated_input_tokens=500)
        decision = router.select_model(routing)
        cap = router._get_capability(decision.model)
        if cap:
            assert cap.supports_tools is True

    def test_select_model_budget_constraint(self, router: ModelRouter):
        routing = RoutingRequest(task_category="general", estimated_input_tokens=100, max_budget=0.00001)
        decision = router.select_model(routing)
        assert decision.estimated_cost <= 0.0001 or decision.model in ("gemini-2.5-flash",)

    def test_select_model_with_preferred_provider(self, router: ModelRouter):
        routing = RoutingRequest(task_category="coding", preferred_provider="deepseek", estimated_input_tokens=500)
        decision = router.select_model(routing)
        assert decision.provider == "deepseek"

    def test_select_model_unknown_category_falls_back_to_general(self, router: ModelRouter):
        routing = RoutingRequest(task_category="summarization", estimated_input_tokens=200)
        decision = router.select_model(routing)
        assert decision.model is not None
        assert decision.reason != ""


class TestTaskClassification:
    def test_build_routing_coding(self):
        from src.models.schemas import ChatRequest, ChatMessage

        req = ChatRequest(
            model="auto",
            messages=[ChatMessage(role="user", content="Write a Python function to sort a list")],
        )
        routing = model_router._build_routing(req)
        assert routing.task_category == "coding"

    def test_build_routing_reasoning(self):
        from src.models.schemas import ChatRequest, ChatMessage

        req = ChatRequest(
            model="auto",
            messages=[ChatMessage(role="user", content="Explain how quantum computing works")],
        )
        routing = model_router._build_routing(req)
        assert routing.task_category == "reasoning"

    def test_build_routing_research(self):
        from src.models.schemas import ChatRequest, ChatMessage

        req = ChatRequest(
            model="auto",
            messages=[ChatMessage(role="user", content="Research the latest AI developments")],
        )
        routing = model_router._build_routing(req)
        assert routing.task_category == "research"

    def test_build_routing_writing(self):
        from src.models.schemas import ChatRequest, ChatMessage

        req = ChatRequest(
            model="auto",
            messages=[ChatMessage(role="user", content="Write a blog post about machine learning")],
        )
        routing = model_router._build_routing(req)
        assert routing.task_category == "writing"

    def test_build_routing_general_default(self):
        from src.models.schemas import ChatRequest, ChatMessage

        req = ChatRequest(
            model="auto",
            messages=[ChatMessage(role="user", content="What is the weather today?")],
        )
        routing = model_router._build_routing(req)
        assert routing.task_category == "general"

    def test_estimated_tokens_computed(self):
        from src.models.schemas import ChatRequest, ChatMessage

        req = ChatRequest(
            model="auto",
            messages=[ChatMessage(role="user", content="hello world")],
        )
        routing = model_router._build_routing(req)
        assert routing.estimated_input_tokens > 0
