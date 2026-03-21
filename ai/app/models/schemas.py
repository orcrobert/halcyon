from pydantic import BaseModel


class Element(BaseModel):
    label: str
    type: str
    prompt: str
    volume: float = 0.5
    file: str | None = None


class Atmosphere(BaseModel):
    atmosphere: str
    elements: list[Element]
