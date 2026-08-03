from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from src.models.schemas import BrandProfileCreate, BrandProfileOut
from src.services.brand_memory import brand_memory

router = APIRouter(prefix="/v1/brands", tags=["brands"])


async def _get_user_id() -> str:
    return "anonymous"


@router.post("", response_model=BrandProfileOut, status_code=201)
async def create_brand(profile: BrandProfileCreate, user_id: str = Depends(_get_user_id)) -> BrandProfileOut:
    return await brand_memory.create(user_id, profile)


@router.get("", response_model=list[BrandProfileOut])
async def list_brands(user_id: str = Depends(_get_user_id)) -> list[BrandProfileOut]:
    return await brand_memory.list_by_user(user_id)


@router.get("/{brand_id}", response_model=BrandProfileOut)
async def get_brand(brand_id: str) -> BrandProfileOut:
    brand = await brand_memory.get(brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    return brand


@router.put("/{brand_id}", response_model=BrandProfileOut)
async def update_brand(brand_id: str, profile: BrandProfileCreate) -> BrandProfileOut:
    brand = await brand_memory.update(brand_id, profile)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    return brand


@router.delete("/{brand_id}", status_code=204)
async def delete_brand(brand_id: str) -> None:
    if not await brand_memory.delete(brand_id):
        raise HTTPException(status_code=404, detail="Brand not found")
