#include "lighting_shared.h"

int lighting_seed_external_border_light(
    const uint8_t *chunk_passable, uint8_t *sky_out, uint8_t *block_out, const uint8_t *east_blocks,
    const uint8_t *east_passable, const uint8_t *east_emitted, const uint16_t *east_heightmap,
    const uint8_t *west_blocks, const uint8_t *west_passable, const uint8_t *west_emitted,
    const uint16_t *west_heightmap, const uint8_t *south_blocks, const uint8_t *south_passable,
    const uint8_t *south_emitted, const uint16_t *south_heightmap, const uint8_t *north_blocks,
    const uint8_t *north_passable, const uint8_t *north_emitted,
    const uint16_t *north_heightmap) {
  if (chunk_passable == NULL || sky_out == NULL || block_out == NULL) {
    return 1;
  }

  IndexQueue sky_queue;
  IndexQueue block_queue;
  if (!lighting_init_queue(&sky_queue, CHUNK_VOLUME / 16) ||
      !lighting_init_queue(&block_queue, CHUNK_VOLUME / 16)) {
    lighting_free_queue(&sky_queue);
    lighting_free_queue(&block_queue);
    return 2;
  }

  if (!lighting_seed_border_from_neighbor(
          chunk_passable, sky_out, block_out, east_blocks, east_passable, east_emitted,
          east_heightmap, 1, 0, &sky_queue, &block_queue) ||
      !lighting_seed_border_from_neighbor(
          chunk_passable, sky_out, block_out, west_blocks, west_passable, west_emitted,
          west_heightmap, -1, 0, &sky_queue, &block_queue) ||
      !lighting_seed_border_from_neighbor(
          chunk_passable, sky_out, block_out, south_blocks, south_passable, south_emitted,
          south_heightmap, 0, 1, &sky_queue, &block_queue) ||
      !lighting_seed_border_from_neighbor(
          chunk_passable, sky_out, block_out, north_blocks, north_passable, north_emitted,
          north_heightmap, 0, -1, &sky_queue, &block_queue)) {
    lighting_free_queue(&sky_queue);
    lighting_free_queue(&block_queue);
    return 2;
  }

  if (!lighting_propagate_sky_light_within_chunk(chunk_passable, sky_out, &sky_queue) ||
      !lighting_propagate_block_light_within_chunk(chunk_passable, block_out, &block_queue)) {
    lighting_free_queue(&sky_queue);
    lighting_free_queue(&block_queue);
    return 2;
  }

  lighting_free_queue(&sky_queue);
  lighting_free_queue(&block_queue);
  return 0;
}

int lighting_propagate_border_pair(
    const uint8_t *left_passable, uint8_t *left_sky, uint8_t *left_block, const uint8_t *right_passable,
    uint8_t *right_sky, uint8_t *right_block, int delta_x, int delta_z) {
  if (left_passable == NULL || left_sky == NULL || left_block == NULL || right_passable == NULL ||
      right_sky == NULL || right_block == NULL) {
    return -1;
  }

  if (abs(delta_x) + abs(delta_z) != 1) {
    return 0;
  }

  IndexQueue left_sky_queue;
  IndexQueue right_sky_queue;
  IndexQueue left_block_queue;
  IndexQueue right_block_queue;
  if (!lighting_init_queue(&left_sky_queue, CHUNK_VOLUME / 16) ||
      !lighting_init_queue(&right_sky_queue, CHUNK_VOLUME / 16) ||
      !lighting_init_queue(&left_block_queue, CHUNK_VOLUME / 16) ||
      !lighting_init_queue(&right_block_queue, CHUNK_VOLUME / 16)) {
    lighting_free_queue(&left_sky_queue);
    lighting_free_queue(&right_sky_queue);
    lighting_free_queue(&left_block_queue);
    lighting_free_queue(&right_block_queue);
    return -2;
  }

  for (int local_y = 0; local_y < CHUNK_HEIGHT; local_y += 1) {
    for (int edge = 0; edge < CHUNK_SIZE; edge += 1) {
      const int left_x = delta_x == 1 ? CHUNK_SIZE - 1 : (delta_x == -1 ? 0 : edge);
      const int right_x = delta_x == 1 ? 0 : (delta_x == -1 ? CHUNK_SIZE - 1 : edge);
      const int left_z = delta_z == 1 ? CHUNK_SIZE - 1 : (delta_z == -1 ? 0 : edge);
      const int right_z = delta_z == 1 ? 0 : (delta_z == -1 ? CHUNK_SIZE - 1 : edge);

      const int left_index = lighting_local_index(left_x, local_y, left_z);
      const int right_index = lighting_local_index(right_x, local_y, right_z);

      if (left_passable[left_index] != 0 && right_passable[right_index] != 0) {
        const uint8_t left_sky_light = left_sky[left_index];
        const uint8_t right_sky_light = right_sky[right_index];
        if (left_sky_light > 1 && left_sky_light - 1 > right_sky_light) {
          right_sky[right_index] = (uint8_t)(left_sky_light - 1);
          if (!lighting_queue_push(&right_sky_queue, (uint32_t)right_index)) {
            lighting_free_queue(&left_sky_queue);
            lighting_free_queue(&right_sky_queue);
            lighting_free_queue(&left_block_queue);
            lighting_free_queue(&right_block_queue);
            return -2;
          }
        }
        if (right_sky_light > 1 && right_sky_light - 1 > left_sky_light) {
          left_sky[left_index] = (uint8_t)(right_sky_light - 1);
          if (!lighting_queue_push(&left_sky_queue, (uint32_t)left_index)) {
            lighting_free_queue(&left_sky_queue);
            lighting_free_queue(&right_sky_queue);
            lighting_free_queue(&left_block_queue);
            lighting_free_queue(&right_block_queue);
            return -2;
          }
        }
      }

      if (right_passable[right_index] != 0) {
        const uint8_t left_block_light = left_block[left_index];
        if (left_block_light > 1 && left_block_light - 1 > right_block[right_index]) {
          right_block[right_index] = (uint8_t)(left_block_light - 1);
          if (!lighting_queue_push(&right_block_queue, (uint32_t)right_index)) {
            lighting_free_queue(&left_sky_queue);
            lighting_free_queue(&right_sky_queue);
            lighting_free_queue(&left_block_queue);
            lighting_free_queue(&right_block_queue);
            return -2;
          }
        }
      }

      if (left_passable[left_index] != 0) {
        const uint8_t right_block_light = right_block[right_index];
        if (right_block_light > 1 && right_block_light - 1 > left_block[left_index]) {
          left_block[left_index] = (uint8_t)(right_block_light - 1);
          if (!lighting_queue_push(&left_block_queue, (uint32_t)left_index)) {
            lighting_free_queue(&left_sky_queue);
            lighting_free_queue(&right_sky_queue);
            lighting_free_queue(&left_block_queue);
            lighting_free_queue(&right_block_queue);
            return -2;
          }
        }
      }
    }
  }

  const int left_sky_changed = left_sky_queue.length > 0;
  const int right_sky_changed = right_sky_queue.length > 0;
  const int left_block_changed = left_block_queue.length > 0;
  const int right_block_changed = right_block_queue.length > 0;

  if (!lighting_propagate_sky_light_within_chunk(left_passable, left_sky, &left_sky_queue) ||
      !lighting_propagate_sky_light_within_chunk(right_passable, right_sky, &right_sky_queue) ||
      !lighting_propagate_block_light_within_chunk(left_passable, left_block, &left_block_queue) ||
      !lighting_propagate_block_light_within_chunk(
          right_passable, right_block, &right_block_queue)) {
    lighting_free_queue(&left_sky_queue);
    lighting_free_queue(&right_sky_queue);
    lighting_free_queue(&left_block_queue);
    lighting_free_queue(&right_block_queue);
    return -2;
  }

  lighting_free_queue(&left_sky_queue);
  lighting_free_queue(&right_sky_queue);
  lighting_free_queue(&left_block_queue);
  lighting_free_queue(&right_block_queue);

  return (left_sky_changed || left_block_changed ? 0x1 : 0) |
         (right_sky_changed || right_block_changed ? 0x2 : 0);
}
